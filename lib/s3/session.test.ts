import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveS3Credentials: vi.fn(),
  getOidcConfig: vi.fn(),
  refreshS3Tokens: vi.fn(),
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

vi.mock("@/lib/s3/oidc", () => ({
  getOidcConfig: mocks.getOidcConfig,
  refreshS3Tokens: mocks.refreshS3Tokens,
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
  federationIdentityProvider?: string;
  s3OidcIdentityProvider?: string;
  s3OidcRefreshToken?: string;
  s3ProjectRoles: Record<string, string>;
  save: ReturnType<typeof vi.fn>;
  sessionSignedInAt: number;
  sessionLastActivityAt: number;
} {
  const now = Date.now();
  return {
    projectId: "project-1",
    federationIdentityProvider: "demo",
    s3OidcIdentityProvider: "demo",
    s3OidcRefreshToken: "old-s3-refresh-token",
    s3ProjectRoles: { project1: "arn:aws:iam::account:role/access" },
    sessionSignedInAt: now - 1_000,
    sessionLastActivityAt: now - 500,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Object Storage credential renewal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveS3Credentials.mockReturnValue(undefined);
    mocks.getOidcConfig.mockReturnValue({ stsDurationSeconds: 1800 });
    mocks.refreshS3Tokens.mockResolvedValue({
      access_token: "refreshed-s3-access-token",
      id_token: "refreshed-s3-id-token",
      refresh_token: "rotated-s3-refresh-token",
    });
    mocks.tryExtractRgwProjectRoles.mockReturnValue({
      project1: "arn:aws:iam::account:role/access",
    });
    mocks.assumeRoleWithIdToken.mockResolvedValue(credentials);
  });

  it("silently replaces expired STS credentials from the OIDC refresh token", async () => {
    const current = session();

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBe(credentials);

    expect(mocks.refreshS3Tokens).toHaveBeenCalledWith(
      "old-s3-refresh-token",
      "demo",
    );
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledWith(
      "refreshed-s3-id-token",
      "project1",
      "arn:aws:iam::account:role/access",
      undefined,
      1800,
    );
    expect(current.s3OidcRefreshToken).toBe("rotated-s3-refresh-token");
    expect(current.save).toHaveBeenCalledTimes(2);
  });

  it("does not turn a missing project role into another SSO loop", async () => {
    const current = session();
    mocks.tryExtractRgwProjectRoles.mockReturnValue({});

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).rejects.toBeInstanceOf(S3ProjectRoleUnavailableError);
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("persists a rotated refresh token before a later STS failure", async () => {
    const current = session();
    mocks.assumeRoleWithIdToken.mockRejectedValue(
      new Error("STS temporarily unavailable"),
    );

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).rejects.toThrow("STS temporarily unavailable");

    expect(current.s3OidcRefreshToken).toBe("rotated-s3-refresh-token");
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("requests unified reauthentication when the refresh token is no longer usable", async () => {
    const current = session();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.refreshS3Tokens.mockRejectedValue(new Error("invalid_grant"));

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });

  it("starts a browser bootstrap when the Object Storage refresh token is absent", async () => {
    const current = session();
    delete current.s3OidcRefreshToken;

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.refreshS3Tokens).not.toHaveBeenCalled();
  });

  it("does not renew STS credentials beyond the Sunrise lifetime", async () => {
    const current = session();
    current.sessionSignedInAt = Date.now() - 9 * 60 * 60_000;

    await expect(
      ensureActiveProjectS3Credentials(current as never),
    ).resolves.toBeUndefined();
    expect(mocks.refreshS3Tokens).not.toHaveBeenCalled();
    expect(mocks.assumeRoleWithIdToken).not.toHaveBeenCalled();
  });
});
