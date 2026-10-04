import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/oidc/sunrise", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { refreshSessionOidcTokens } from "@/lib/oidc/session-refresh";

function session(sessionId: string, refreshToken = "old-refresh-token") {
  return {
    sessionId,
    keycloakRefreshToken: refreshToken,
  };
}

describe("OIDC session token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coalesces concurrent refreshes and applies the same rotated token", async () => {
    let resolveRefresh:
      | ((value: {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          token_type: string;
        }) => void)
      | undefined;
    mocks.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = session("concurrent-session");
    const second = session("concurrent-session");
    const firstRefresh = refreshSessionOidcTokens(first as never, "demo");
    const secondRefresh = refreshSessionOidcTokens(second as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    resolveRefresh?.({
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    });

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      expect.objectContaining({ access_token: "new-access-token" }),
      expect.objectContaining({ access_token: "new-access-token" }),
    ]);
    expect(first.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(second.keycloakRefreshToken).toBe("rotated-refresh-token");
  });

  it("reuses a completed refresh for requests carrying either cookie token", async () => {
    mocks.refreshAccessToken.mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    });

    const first = session("stale-cookie-session");
    await refreshSessionOidcTokens(first as never, "demo");

    const staleCookie = session("stale-cookie-session");
    const rotatedCookie = session(
      "stale-cookie-session",
      "rotated-refresh-token",
    );
    await refreshSessionOidcTokens(staleCookie as never, "demo");
    await refreshSessionOidcTokens(rotatedCookie as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(staleCookie.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(rotatedCookie.keycloakRefreshToken).toBe("rotated-refresh-token");
  });

  it("does nothing when the session has no refresh token", async () => {
    const current = { sessionId: "missing-token-session" };

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toBeUndefined();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });
});
