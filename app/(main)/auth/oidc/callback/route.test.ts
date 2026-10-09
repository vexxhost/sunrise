import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUNRISE_DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    saveSessionActivity: vi.fn(),
    startSessionLifetime: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    getSunriseOidcConfig: vi.fn(),
    resolveOidcIdentity: vi.fn(),
    federateOidcWithKeystone: vi.fn(),
    finalizeKeystoneSession: vi.fn(),
    assumeRoleWithIdToken: vi.fn(),
    tryExtractRgwProjectRoles: vi.fn(),
    getS3Endpoint: vi.fn(),
    stashCloudContextBootstrap: vi.fn(),
    saveRedisSession: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cloud-context-bootstrap", () => ({
  stashCloudContextBootstrap: mocks.stashCloudContextBootstrap,
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  saveSessionActivity: mocks.saveSessionActivity,
  startSessionLifetime: mocks.startSessionLifetime,
  normalizeProjectId: (value?: string) => value?.replaceAll("-", "") ?? "",
  setS3CredentialsForProject: vi.fn(),
}));

vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));

vi.mock("@/lib/oidc/sunrise", () => ({
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
  getSunriseOidcConfig: mocks.getSunriseOidcConfig,
  resolveOidcIdentity: mocks.resolveOidcIdentity,
}));

vi.mock("@/lib/keystone/login", () => ({
  federateOidcWithKeystone: mocks.federateOidcWithKeystone,
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
  KeystoneSessionSetupError: class KeystoneSessionSetupError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  },
}));

vi.mock("@/lib/s3/sts", () => ({
  assumeRoleWithIdToken: mocks.assumeRoleWithIdToken,
  tryExtractRgwProjectRoles: mocks.tryExtractRgwProjectRoles,
}));

vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
}));

import { GET } from "./route";
import { StoredSessionSupersededError } from "@/lib/session-errors";

const identity = {
  subject: "user-123",
  displayName: "Sunrise Operator",
  email: "operator@example.test",
  preferredUsername: "operator@example.test",
  issuer: "https://identity.example.test/realms/demo",
  identityProvider: "demo",
};

function session() {
  return {
    oidcState: "expected-state",
    oidcVerifier: "verifier",
    oidcFlowId: "login-flow",
    oidcIdProvider: "demo",
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function readyResolution() {
  return {
    status: "ready" as const,
    project: { id: "project-1", name: "Project One" },
    region: { id: "RegionOne" },
    projects: [{ id: "project-1", name: "Project One" }],
    regions: [{ id: "RegionOne" }],
    catalog: [
      {
        name: "s3",
        type: "object-storage-s3",
        endpoints: [
          {
            interface: "public",
            region: "RegionOne",
            url: "https://s3.example.test",
          },
        ],
      },
    ],
    userName: "operator@example.test",
  };
}

describe("OIDC callback recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUNRISE_DISABLED_SERVICES;
    delete process.env.SUNRISE_DISABLED_SERVICES_REGIONONE;
    process.env.SUNRISE_OBJECT_STORAGE_BACKENDS = "s3";
    mocks.exchangeCodeForTokens.mockResolvedValue({
      access_token: "access-token",
      id_token: "id-token",
      refresh_token: "refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    });
    mocks.getSunriseOidcConfig.mockReturnValue({
      protocol: "demo-openid",
      rgwStsDurationSeconds: 1800,
    });
    mocks.resolveOidcIdentity.mockResolvedValue(identity);
    mocks.federateOidcWithKeystone.mockResolvedValue("unscoped-token");
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");
    mocks.stashCloudContextBootstrap.mockReturnValue("bootstrap-id");
    mocks.saveSessionActivity.mockResolvedValue(undefined);
    mocks.startSessionLifetime.mockResolvedValue(undefined);
    mocks.saveRedisSession.mockImplementation(
      async (activeSession: { save: () => Promise<void> }) =>
        activeSession.save(),
    );
  });

  it("redirects an identity with zero projects to the recovery experience", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockResolvedValue({
      status: "no-projects",
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(current).toMatchObject({
      oidcIdentity: identity,
      authRecovery: { reason: "no-projects" },
      keycloakRefreshToken: "refresh-token",
      oidcSessionGeneration: expect.any(String),
    });
    expect(current.save).toHaveBeenCalled();
    expect(mocks.startSessionLifetime).toHaveBeenCalledWith(current);
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("preserves the absolute lifetime during interactive token renewal", async () => {
    const now = Date.now();
    const current = {
      ...session(),
      oidcSessionContinuation: true,
      oidcRefreshCheckpoint: {
        consumedTokenDigest: "consumed",
        identityProvider: "demo",
        issuedTokenDigest: "issued",
        result: {
          access_token: "old-access-token",
          expires_in: 300,
          token_type: "Bearer",
        },
        reuseUntil: now + 30_000,
      },
      sessionId: "session-1",
      sessionSignedInAt: now - 1_000,
      sessionLastActivityAt: now - 500,
    };
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "no-projects" });
    mocks.exchangeCodeForTokens.mockImplementationOnce(async () => {
      expect(current.oidcSessionContinuation).toBe(true);
      return {
        access_token: "access-token",
        id_token: "id-token",
        refresh_token: "refresh-token",
        expires_in: 300,
        token_type: "Bearer",
      };
    });

    await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(mocks.saveSessionActivity).toHaveBeenCalledWith("session-1");
    expect(mocks.startSessionLifetime).not.toHaveBeenCalled();
    expect(current.sessionSignedInAt).toBe(now - 1_000);
    expect(current.oidcRefreshCheckpoint).toBeUndefined();
    expect(current.oidcSessionContinuation).toBeUndefined();
  });

  it("completes Keystone login when S3 is absent", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return {
        ...readyResolution(),
        catalog: [
          {
            name: "nova",
            type: "compute",
            endpoints: [
              {
                interface: "public",
                region: "RegionOne",
                url: "https://nova.example.test",
              },
            ],
          },
        ],
      };
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
    expect(current).toMatchObject({
      projectId: "project-1",
      keystoneProjectToken: "project-token",
    });
  });

  it("skips S3 setup when the backend is disabled in the selected region", async () => {
    process.env.SUNRISE_DISABLED_SERVICES_REGIONONE = "object-storage-s3";
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return readyResolution();
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("reports invalid service policy before consuming the OIDC code", async () => {
    process.env.SUNRISE_DISABLED_SERVICES_REGIONONE = "not-a-service";
    const current = session();
    mocks.getSession.mockResolvedValue(current);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain(
      "Sunrise configuration error",
    );
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(current.save).toHaveBeenCalledTimes(2);
  });

  it("rejects continuation after the absolute lifetime", async () => {
    const current = {
      ...session(),
      oidcSessionContinuation: true,
      sessionId: "session-1",
      sessionSignedInAt: Date.now() - 9 * 60 * 60_000,
      sessionLastActivityAt: Date.now(),
    };
    mocks.getSession.mockResolvedValue(current);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(mocks.saveSessionActivity).not.toHaveBeenCalled();
  });

  it("keeps the signed-in identity when Keystone federation fails", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.federateOidcWithKeystone.mockRejectedValue(
      new Error("federation rejected"),
    );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(current).toMatchObject({
      oidcIdentity: identity,
      authRecovery: { reason: "federation-failed" },
    });
    expect(mocks.finalizeKeystoneSession).not.toHaveBeenCalled();
  });

  it("returns to the requested view after rebuilding Keystone and STS", async () => {
    const current = {
      ...session(),
      oidcReturnTo: "/object-storage/buckets/example?prefix=reports%2F",
    };
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return readyResolution();
    });
    mocks.tryExtractRgwProjectRoles.mockReturnValue({
      project1: "arn:aws:iam::account:role/access",
    });
    mocks.assumeRoleWithIdToken.mockResolvedValue({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
      expiration: Date.now() + 3_600_000,
      projectId: "project1",
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/buckets/example?prefix=reports%2F",
    );
    expect(current.oidcReturnTo).toBeUndefined();
    expect(mocks.exchangeCodeForTokens).toHaveBeenCalledWith(
      "code",
      "verifier",
      "demo",
    );
    expect(mocks.federateOidcWithKeystone).toHaveBeenCalledWith(
      "access-token",
      "demo",
      "demo-openid",
    );
    expect(mocks.getS3Endpoint).toHaveBeenCalledWith({
      regionId: "RegionOne",
      token: "project-token",
      catalog: readyResolution().catalog,
    });
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledWith(
      "access-token",
      "project1",
      "arn:aws:iam::account:role/access",
      "https://s3.example.test",
      1800,
    );
    expect(current).toMatchObject({
      cloudContextBootstrapId: "bootstrap-id",
    });
    expect(mocks.stashCloudContextBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "operator@example.test" }),
    );
    expect(current.save).toHaveBeenCalledTimes(2);
    expect(current.oidcFlowId).toBeUndefined();
  });

  it("does not consume the code after a newer login supersedes the flow", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.saveRedisSession.mockImplementationOnce(
      async (
        _activeSession: unknown,
        options: {
          validateConflictRetry?: (authoritative: {
            oidcFlowId?: string;
          }) => void;
        },
      ) => {
        options.validateConflictRetry?.({ oidcFlowId: "newer-login-flow" });
      },
    );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(current.save).not.toHaveBeenCalled();
  });

  it("does not clear a newer flow when an older callback arrives", async () => {
    const current = {
      ...session(),
      oidcState: "newer-state",
      oidcFlowId: "newer-login-flow",
    };
    mocks.getSession.mockResolvedValue(current);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=old-code&state=expected-state",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("OIDC state mismatch");
    expect(mocks.saveRedisSession).not.toHaveBeenCalled();
    expect(current.oidcFlowId).toBe("newer-login-flow");
    expect(current.oidcState).toBe("newer-state");
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("does not publish callback results after a newer login takes ownership", async () => {
    process.env.SUNRISE_DISABLED_SERVICES_REGIONONE = "object-storage-s3";
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return readyResolution();
    });
    mocks.saveRedisSession
      .mockImplementationOnce(
        async (activeSession: { save: () => Promise<void> }) =>
          activeSession.save(),
      )
      .mockImplementationOnce(
        async (
          _activeSession: unknown,
          options: {
            validateConflictRetry?: (authoritative: {
              oidcFlowId?: string;
            }) => void;
          },
        ) => {
          options.validateConflictRetry?.({ oidcFlowId: "newer-login-flow" });
        },
      );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.finalizeKeystoneSession).toHaveBeenCalledOnce();
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("redirects when a newer callback rotates the stored session", async () => {
    process.env.SUNRISE_DISABLED_SERVICES_REGIONONE = "object-storage-s3";
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return readyResolution();
    });
    mocks.saveRedisSession
      .mockImplementationOnce(
        async (activeSession: { save: () => Promise<void> }) =>
          activeSession.save(),
      )
      .mockRejectedValueOnce(
        new StoredSessionSupersededError(
          "Cannot save a revoked Sunrise session",
        ),
      );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.finalizeKeystoneSession).toHaveBeenCalledOnce();
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("redirects when the login boundary was already rotated", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.startSessionLifetime.mockRejectedValueOnce(
      new StoredSessionSupersededError(
        "Cannot rotate a missing or revoked Sunrise session",
      ),
    );

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.federateOidcWithKeystone).not.toHaveBeenCalled();
  });

  it("waits for the Keystone project context before starting STS", async () => {
    const current = { ...session(), regionId: "RegionOne" };
    mocks.getSession.mockResolvedValue(current);
    let finishKeystone!: (value: ReturnType<typeof readyResolution>) => void;
    mocks.finalizeKeystoneSession.mockImplementation(async (activeSession) => {
      activeSession.projectId = "project-1";
      activeSession.regionId = "RegionOne";
      activeSession.keystoneProjectToken = "project-token";
      return await new Promise<ReturnType<typeof readyResolution>>(
        (resolve) => {
          finishKeystone = resolve;
        },
      );
    });
    mocks.tryExtractRgwProjectRoles.mockReturnValue({
      project1: "arn:aws:iam::account:role/access",
    });
    mocks.assumeRoleWithIdToken.mockResolvedValue({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
      expiration: Date.now() + 3_600_000,
      projectId: "project1",
    });

    const responsePromise = GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/callback?code=code&state=expected-state",
      ),
    );

    await vi.waitFor(() => {
      expect(mocks.finalizeKeystoneSession).toHaveBeenCalled();
    });
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();

    finishKeystone(readyResolution());
    await expect(responsePromise).resolves.toMatchObject({ status: 303 });
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledOnce();
  });
});
