import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assumeRoleWithIdToken: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  getOidcConfig: vi.fn(),
  getS3Endpoint: vi.fn(),
  getSession: vi.fn(),
  setS3CredentialsForProject: vi.fn(),
  tryExtractRgwProjectRoles: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  normalizeProjectId: (value?: string) =>
    value?.replaceAll("-", "").toLowerCase() ?? "",
  setS3CredentialsForProject: mocks.setS3CredentialsForProject,
}));
vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
}));
vi.mock("@/lib/s3/oidc", () => ({
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
  getOidcConfig: mocks.getOidcConfig,
  normalizeObjectStorageReturnTo: (value?: string | null) =>
    value?.startsWith("/object-storage") ? value : "/object-storage",
}));
vi.mock("@/lib/s3/sts", () => ({
  assumeRoleWithIdToken: mocks.assumeRoleWithIdToken,
  tryExtractRgwProjectRoles: mocks.tryExtractRgwProjectRoles,
}));

import { GET } from "./route";

describe("Object Storage OIDC callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");
    mocks.exchangeCodeForTokens.mockResolvedValue({
      access_token: "rgw-access-token",
      id_token: "rgw-id-token",
      refresh_token: "rgw-refresh-token",
    });
    mocks.tryExtractRgwProjectRoles.mockReturnValue({
      project1: "arn:aws:iam::account:role/access",
    });
    mocks.getOidcConfig.mockReturnValue({
      dashboardUrl: "https://sunrise.example.test",
      stsDurationSeconds: 2700,
    });
    mocks.assumeRoleWithIdToken.mockResolvedValue({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token",
      expiration: Date.now() + 2_700_000,
      projectId: "project1",
    });
  });

  it("uses the provider captured before redirect even if other session data differs", async () => {
    const session = {
      federationIdentityProvider: "demo",
      projectId: "project-1",
      s3OidcPendingIdentityProvider: "workforce",
      s3OidcReturnTo: "/object-storage/buckets",
      s3OidcState: "expected-state",
      s3OidcVerifier: "verifier",
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getSession.mockResolvedValue(session);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/callback?code=code&state=expected-state",
      ),
    );

    expect(response.status).toBe(307);
    expect(mocks.exchangeCodeForTokens).toHaveBeenCalledWith(
      "code",
      "verifier",
      "workforce",
    );
    expect(mocks.getOidcConfig).toHaveBeenCalledWith("workforce");
    expect(mocks.assumeRoleWithIdToken).toHaveBeenCalledWith(
      "rgw-id-token",
      "project1",
      "arn:aws:iam::account:role/access",
      undefined,
      2700,
    );
    expect(session).toMatchObject({
      s3OidcIdentityProvider: "workforce",
      s3OidcRefreshToken: "rgw-refresh-token",
      s3OidcPendingIdentityProvider: undefined,
    });
    expect(mocks.setS3CredentialsForProject).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/buckets",
    );
  });
});
