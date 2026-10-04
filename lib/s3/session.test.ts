import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveS3Credentials: vi.fn(),
  getSunriseOidcConfig: vi.fn(),
  refreshSessionOidcTokens: vi.fn(),
  assumeRoleWithIdToken: vi.fn(),
  tryExtractRgwProjectRoles: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/session", () => ({
  getActiveS3Credentials: mocks.getActiveS3Credentials,
  normalizeProjectId: (value?: string) =>
    value?.replaceAll("-", "").toLowerCase() ?? "",
  setS3CredentialsForProject: vi.fn((session, credentials) => {
    session.s3Credentials = credentials;
  }),
}));

vi.mock("@/lib/oidc/session-refresh", () => ({
  refreshSessionOidcTokens: mocks.refreshSessionOidcTokens,
}));

vi.mock("@/lib/oidc/sunrise", () => ({
  getSunriseOidcConfig: mocks.getSunriseOidcConfig,
}));

vi.mock("@/lib/s3/sts", () => ({
  assumeRoleWithIdToken: mocks.assumeRoleWithIdToken,
  tryExtractRgwProjectRoles: mocks.tryExtractRgwProjectRoles,
}));

import {
  ensureActiveProjectS3Credentials,
  S3ProjectRoleUnavailableError,
} from "@/lib/s3/session";

const credentials = {
  accessKeyId: "new-access-key",
  secretAccessKey: "new-secret-key",
  sessionToken: "new-session-token",
  expiration: Date.now() + 3_600_000,
  projectId: "project1",
};

function session(): {
  projectId: string;
  federationIdentityProvider: string;
  keycloakRefreshToken?: string;
  s3ProjectRoles: Record<string, string>;
  sessionId: string;
  sessionSignedInAt: number;
  sessionLastActivityAt: number;
  save: ReturnType<typeof vi.fn>;
} {
  const now = Date.now();
  return {
    projectId: "project-1",
    federationIdentityProvider: "demo",
    keycloakRefreshToken: "old-primary-refresh-token",
    s3ProjectRoles: { project1: "arn:aws:iam::account:role/access" },
    sessionId: "session-1",
    sessionSignedInAt: now - 1_000,
    sessionLastActivityAt: now - 500,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Object Storage credential renewal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveS3Credentials.mockReturnValue(undefined);
    mocks.getSunriseOidcConfig.mockReturnValue({
      rgwStsDurationSeconds: 1800,
    });
    mocks.refreshSessionOidcTokens.mockImplementation(async (current) => {
      current.keycloakRefreshToken = "rotated-primary-refresh-token";
      return {
        access_token: "refreshed-primary-access-token",
        id_token: "refreshed-primary-id-token",
        refresh_token: "rotated-primary-refresh-token",
      };
    });
    mocks.tryExtractRgwProjectRoles.mockReturnValue({
      project1: "arn:aws:iam::account:role/access",
    });
    mocks.assumeRoleWithIdToken.mockResolvedValue(credentials);
  });

  it("silently replaces expired STS credentials from the Sunrise OIDC session", async () => {
    const current = session();

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBe(credentials);

    expect(mocks.refreshSessionOidcTokens).toHaveBeenCalledWith(
      current,
      "demo",
    );
    expect(mocks.tryExtractRgwProjectRoles).toHaveBeenCalledWith(
      "refreshed-primary-access-token",
      "refreshed-primary-id-token",
    );
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledWith(
      "refreshed-primary-access-token",
      "project1",
      "arn:aws:iam::account:role/access",
      undefined,
      1800,
    );
    expect(current.keycloakRefreshToken).toBe("rotated-primary-refresh-token");
    expect(current.save).toHaveBeenCalledTimes(2);
  });

  it("does not turn a missing project role into another SSO loop", async () => {
    const current = session();
    mocks.tryExtractRgwProjectRoles.mockReturnValue({});

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).rejects.toBeInstanceOf(S3ProjectRoleUnavailableError);
    expect(current.save).toHaveBeenCalledOnce();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("persists a rotated refresh token before a later STS failure", async () => {
    const current = session();
    mocks.assumeRoleWithIdToken.mockRejectedValue(
      new Error("STS temporarily unavailable"),
    );

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).rejects.toThrow("STS temporarily unavailable");

    expect(current.keycloakRefreshToken).toBe("rotated-primary-refresh-token");
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("returns no credentials when the Sunrise refresh token is unavailable", async () => {
    const current = session();
    delete current.keycloakRefreshToken;

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.refreshSessionOidcTokens).not.toHaveBeenCalled();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("returns no credentials when the Sunrise refresh token is rejected", async () => {
    const current = session();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.refreshSessionOidcTokens.mockRejectedValue(
      new Error("invalid_grant"),
    );

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("does not renew STS credentials beyond the Sunrise lifetime", async () => {
    const current = session();
    current.sessionSignedInAt = Date.now() - 9 * 60 * 60_000;

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.refreshSessionOidcTokens).not.toHaveBeenCalled();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });
});
