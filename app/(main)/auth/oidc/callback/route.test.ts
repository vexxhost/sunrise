import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    resolveOidcIdentity: vi.fn(),
    tokenExchangeForRgw: vi.fn(),
    federateOidcWithKeystone: vi.fn(),
    finalizeKeystoneSession: vi.fn(),
    assumeRoleWithIdToken: vi.fn(),
    tryExtractRgwProjectRoles: vi.fn(),
    getS3Endpoint: vi.fn(),
    stashCloudContextBootstrap: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cloud-context-bootstrap", () => ({
  stashCloudContextBootstrap: mocks.stashCloudContextBootstrap,
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  normalizeProjectId: (value?: string) => value?.replaceAll("-", "") ?? "",
  setS3CredentialsForProject: vi.fn(),
}));

vi.mock("@/lib/oidc/sunrise", () => ({
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
  resolveOidcIdentity: mocks.resolveOidcIdentity,
  tokenExchangeForRgw: mocks.tokenExchangeForRgw,
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
    catalog: [{ name: "s3", type: "object-storage-s3", endpoints: [] }],
    userName: "operator@example.test",
  };
}

describe("OIDC callback recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForTokens.mockResolvedValue({
      access_token: "access-token",
      id_token: "id-token",
      refresh_token: "refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    });
    mocks.resolveOidcIdentity.mockResolvedValue(identity);
    mocks.federateOidcWithKeystone.mockResolvedValue("unscoped-token");
    mocks.tokenExchangeForRgw.mockResolvedValue({
      access_token: "rgw-token",
    });
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");
    mocks.stashCloudContextBootstrap.mockReturnValue("bootstrap-id");
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
    });
    expect(current.save).toHaveBeenCalled();
    expect(mocks.tokenExchangeForRgw).toHaveBeenCalledWith("access-token");
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
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
    expect(mocks.tokenExchangeForRgw).toHaveBeenCalledWith("access-token");
    expect(mocks.getS3Endpoint).toHaveBeenCalledWith({
      regionId: "RegionOne",
      token: "project-token",
      catalog: readyResolution().catalog,
    });
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledWith(
      "rgw-token",
      "project1",
      "arn:aws:iam::account:role/access",
      "https://s3.example.test",
    );
    expect(current).toMatchObject({
      cloudContextBootstrapId: "bootstrap-id",
    });
    expect(mocks.stashCloudContextBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "operator@example.test" }),
    );
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("starts RGW exchange while cold Keystone setup is still resolving", async () => {
    const current = session();
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
      expect(mocks.tokenExchangeForRgw).toHaveBeenCalledWith("access-token");
      expect(mocks.finalizeKeystoneSession).toHaveBeenCalled();
    });
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();

    finishKeystone(readyResolution());
    await expect(responsePromise).resolves.toMatchObject({ status: 303 });
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledOnce();
  });
});
