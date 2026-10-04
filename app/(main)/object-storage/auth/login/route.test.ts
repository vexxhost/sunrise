import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverOidc: vi.fn(),
  generatePkce: vi.fn(),
  generateState: vi.fn(),
  getOidcConfig: vi.fn(),
  getS3Endpoint: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: mocks.getS3Endpoint,
}));
vi.mock("@/lib/s3/oidc", () => ({
  discoverOidc: mocks.discoverOidc,
  generatePkce: mocks.generatePkce,
  generateState: mocks.generateState,
  getOidcConfig: mocks.getOidcConfig,
  normalizeObjectStorageReturnTo: (value?: string | null) =>
    value?.startsWith("/object-storage") ? value : "/object-storage",
}));

import { GET } from "./route";

describe("Object Storage OIDC login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3Endpoint.mockResolvedValue("https://s3.example.test");
    mocks.discoverOidc.mockResolvedValue({
      authorization_endpoint:
        "https://identity.example.test/realms/workforce/authorize",
    });
    mocks.getOidcConfig.mockReturnValue({
      clientId: "rgw-workforce",
      redirectUri: "https://sunrise.example.test/object-storage/auth/callback",
    });
    mocks.generatePkce.mockReturnValue({
      verifier: "verifier",
      challenge: "challenge",
    });
    mocks.generateState.mockReturnValue("state");
  });

  it("binds the active federation provider to the callback state", async () => {
    const session = {
      federationIdentityProvider: "workforce",
      oidcIdentity: { identityProvider: "demo" },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getSession.mockResolvedValue(session);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/login?returnTo=%2Fobject-storage%2Froles",
      ),
    );

    expect(response.status).toBe(307);
    expect(mocks.discoverOidc).toHaveBeenCalledWith("workforce");
    expect(mocks.getOidcConfig).toHaveBeenCalledWith("workforce");
    expect(session).toMatchObject({
      s3OidcPendingIdentityProvider: "workforce",
      s3OidcReturnTo: "/object-storage/roles",
      s3OidcState: "state",
      s3OidcVerifier: "verifier",
    });
    expect(session.save).toHaveBeenCalledOnce();
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("client_id")).toBe("rgw-workforce");
  });

  it("uses the recovery view when the selected provider has no RGW client", async () => {
    mocks.getSession.mockResolvedValue({
      federationIdentityProvider: "workforce",
    });
    mocks.getOidcConfig.mockImplementation(() => {
      throw new Error("RGW OIDC is not configured");
    });

    const response = await GET(
      new Request(
        "https://sunrise.example.test/object-storage/auth/login?returnTo=%2Fobject-storage%2Fbuckets",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/object-storage/auth/unavailable?returnTo=%2Fobject-storage%2Fbuckets",
    );
  });
});
