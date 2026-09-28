import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  federateOidcWithKeystone: vi.fn(),
  finalizeKeystoneSession: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/keystone/login", () => ({
  federateOidcWithKeystone: mocks.federateOidcWithKeystone,
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
}));
vi.mock("@/lib/oidc/sunrise", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { refreshKeystoneSession } from "@/lib/keystone/renewal";

function session() {
  return {
    keycloakRefreshToken: "old-refresh-token",
    oidcIdentity: { identityProvider: "demo" },
    authRecovery: { reason: "session-unavailable" },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Keystone session renewal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshAccessToken.mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
    });
    mocks.federateOidcWithKeystone.mockResolvedValue("new-unscoped-token");
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "ready" });
  });

  it("silently rebuilds Keystone tokens from the Keycloak refresh token", async () => {
    const current = session();

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "ready",
    );
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith("old-refresh-token");
    expect(mocks.federateOidcWithKeystone).toHaveBeenCalledWith(
      "new-access-token",
      "demo",
      "openid",
    );
    expect(mocks.finalizeKeystoneSession).toHaveBeenCalledWith(
      current,
      "new-unscoped-token",
    );
    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(current.authRecovery).toBeUndefined();
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("preserves no-project recovery after a successful identity refresh", async () => {
    const current = session();
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "no-projects" });

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "no-projects",
    );
    expect(current.authRecovery).toEqual({ reason: "no-projects" });
  });

  it("requests browser reauthentication when the root refresh token is gone", async () => {
    const current = session();
    mocks.refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "reauthenticate",
    );
    expect(mocks.federateOidcWithKeystone).not.toHaveBeenCalled();
  });
});
