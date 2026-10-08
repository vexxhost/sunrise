import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/oidc/sunrise", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

import {
  refreshSessionOidcTokens,
  sealDistributedRefreshResult,
  unsealDistributedRefreshResult,
} from "@/lib/oidc/session-refresh";

const originalSessionSecret = process.env.SUNRISE_SESSION_SECRET;

function session(sessionId: string, refreshToken = "old-refresh-token") {
  return {
    sessionId,
    keycloakRefreshToken: refreshToken,
  };
}

describe("OIDC session token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUNRISE_SESSION_SECRET =
      "test-session-secret-that-is-at-least-thirty-two-characters";
  });

  afterEach(() => {
    process.env.SUNRISE_SESSION_SECRET = originalSessionSecret;
  });

  it("encrypts distributed refresh results before sharing them", async () => {
    const result = {
      access_token: "sensitive-access-token",
      refresh_token: "sensitive-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };

    const sealed = await sealDistributedRefreshResult(result);

    expect(sealed).not.toContain(result.access_token);
    expect(sealed).not.toContain(result.refresh_token);
    await expect(unsealDistributedRefreshResult(sealed)).resolves.toEqual(
      result,
    );
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
