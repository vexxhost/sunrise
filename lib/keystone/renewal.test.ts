import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  federateOidcWithKeystone: vi.fn(),
  finalizeKeystoneSession: vi.fn(),
  getSunriseOidcConfig: vi.fn(),
  refreshSessionOidcTokens: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/keystone/login", () => ({
  federateOidcWithKeystone: mocks.federateOidcWithKeystone,
  finalizeKeystoneSession: mocks.finalizeKeystoneSession,
}));
vi.mock("@/lib/oidc/session-refresh", () => ({
  refreshSessionOidcTokens: mocks.refreshSessionOidcTokens,
}));
vi.mock("@/lib/oidc/sunrise", () => ({
  getSunriseOidcConfig: mocks.getSunriseOidcConfig,
}));

import { refreshKeystoneSession } from "@/lib/keystone/renewal";

function session() {
  const now = Date.now();
  return {
    keycloakRefreshToken: "old-refresh-token",
    federationIdentityProvider: "demo",
    oidcIdentity: { identityProvider: "demo" },
    authRecovery: { reason: "session-unavailable" },
    sessionId: "session-1",
    sessionSignedInAt: now - 1_000,
    sessionLastActivityAt: now - 500,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Keystone session renewal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshSessionOidcTokens.mockImplementation(async (current) => {
      current.keycloakRefreshToken = "rotated-refresh-token";
      await current.save();
      return {
        access_token: "new-access-token",
        refresh_token: "rotated-refresh-token",
      };
    });
    mocks.getSunriseOidcConfig.mockReturnValue({ protocol: "demo-openid" });
    mocks.federateOidcWithKeystone.mockResolvedValue("new-unscoped-token");
    mocks.finalizeKeystoneSession.mockResolvedValue({ status: "ready" });
  });

  it("silently rebuilds Keystone tokens from the Keycloak refresh token", async () => {
    const current = session();

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "ready",
    );
    expect(mocks.refreshSessionOidcTokens).toHaveBeenCalledWith(
      current,
      "demo",
    );
    expect(mocks.federateOidcWithKeystone).toHaveBeenCalledWith(
      "new-access-token",
      "demo",
      "demo-openid",
    );
    expect(mocks.finalizeKeystoneSession).toHaveBeenCalledWith(
      current,
      "new-unscoped-token",
    );
    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(current.authRecovery).toBeUndefined();
    expect(current.save).toHaveBeenCalledTimes(2);
  });

  it("persists a rotated refresh token before downstream federation", async () => {
    const calls: string[] = [];
    const current = session();
    current.save.mockImplementation(async () => {
      calls.push("save");
    });
    mocks.federateOidcWithKeystone.mockImplementation(async () => {
      calls.push("federate");
      throw new Error("Keystone unavailable");
    });

    await expect(refreshKeystoneSession(current as never)).rejects.toThrow(
      "Keystone unavailable",
    );

    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(current.save).toHaveBeenCalledOnce();
    expect(calls).toEqual(["save", "federate"]);
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
    mocks.refreshSessionOidcTokens.mockRejectedValue(
      new Error("invalid_grant"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "reauthenticate",
    );
    expect(mocks.federateOidcWithKeystone).not.toHaveBeenCalled();
  });

  it("does not renew child sessions beyond the Sunrise lifetime", async () => {
    const current = session();
    current.sessionSignedInAt = Date.now() - 9 * 60 * 60_000;

    await expect(refreshKeystoneSession(current as never)).resolves.toBe(
      "expired",
    );
    expect(mocks.refreshSessionOidcTokens).not.toHaveBeenCalled();
  });
});
