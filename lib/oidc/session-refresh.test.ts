import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getSessionBackend: vi.fn(() => "cookie"),
  getRedisKeyPrefix: vi.fn(() => "sunrise"),
  runRedisCommand: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/oidc/sunrise", () => ({
  OIDC_REFRESH_TIMEOUT_MS: 30_000,
  refreshAccessToken: mocks.refreshAccessToken,
}));
vi.mock("@/lib/redis", () => ({
  getSessionBackend: mocks.getSessionBackend,
  getRedisKeyPrefix: mocks.getRedisKeyPrefix,
  runRedisCommand: mocks.runRedisCommand,
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
    mocks.getSessionBackend.mockReturnValue("cookie");
    process.env.SUNRISE_SESSION_SECRET =
      "test-session-secret-that-is-at-least-thirty-two-characters";
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("reuses a result published before the distributed lock is acquired", async () => {
    const result = {
      access_token: "shared-access-token",
      refresh_token: "shared-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };
    const sealed = await sealDistributedRefreshResult(result);
    const client = {
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(sealed),
      eval: vi.fn().mockResolvedValue(2),
      hIncrBy: vi.fn().mockResolvedValue(1),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    const current = session("distributed-result-race");

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(result);

    expect(client.eval).toHaveBeenCalledOnce();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(current.keycloakRefreshToken).toBe("shared-refresh-token");
  });

  it("returns a cached distributed result without waiting for metrics", async () => {
    const result = {
      access_token: "cached-access-token",
      refresh_token: "cached-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };
    const sealed = await sealDistributedRefreshResult(result);
    const client = {
      get: vi.fn().mockResolvedValue(sealed),
      hIncrBy: vi.fn(() => new Promise<never>(() => undefined)),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    await expect(
      refreshSessionOidcTokens(
        session("non-blocking-cached-result-metrics") as never,
        "demo",
      ),
    ).resolves.toEqual(result);

    expect(client.hIncrBy).toHaveBeenCalledOnce();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("returns a follower result without waiting for metrics", async () => {
    vi.useFakeTimers();
    const result = {
      access_token: "follower-access-token",
      refresh_token: "follower-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };
    const sealed = await sealDistributedRefreshResult(result);
    const client = {
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(sealed),
      eval: vi.fn().mockResolvedValue(0),
      hIncrBy: vi.fn(() => new Promise<never>(() => undefined)),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const refresh = refreshSessionOidcTokens(
      session("non-blocking-follower-metrics") as never,
      "demo",
    );
    await vi.advanceTimersByTimeAsync(40);

    await expect(refresh).resolves.toEqual(result);
    expect(client.hIncrBy).toHaveBeenCalledOnce();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("aborts the token exchange when the distributed lease is lost", async () => {
    vi.useFakeTimers();
    const client = {
      get: vi.fn().mockResolvedValue(null),
      eval: vi.fn(
        async (
          _script: string,
          options: { keys: string[]; arguments: string[] },
        ) => {
          if (options.keys.length === 2) return 1;
          if (options.arguments[1] === "20000") return 0;
          return 1;
        },
      ),
      hIncrBy: vi.fn().mockResolvedValue(1),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockImplementation(
      async (_token: string, _provider: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const refresh = refreshSessionOidcTokens(
      session("lost-distributed-lease") as never,
      "demo",
    );
    const rejection = expect(refresh).rejects.toThrow(
      "Lost the distributed OIDC refresh lease",
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "old-refresh-token",
      "demo",
      expect.any(AbortSignal),
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
  });

  it("aborts a stalled renewal before the distributed lease expires", async () => {
    vi.useFakeTimers();
    const client = {
      get: vi.fn().mockResolvedValue(null),
      eval: vi.fn(
        async (
          _script: string,
          options: { keys: string[]; arguments: string[] },
        ) => {
          if (options.keys.length === 2) return 1;
          if (options.arguments[1] === "20000") {
            return new Promise<never>(() => undefined);
          }
          return 1;
        },
      ),
      hIncrBy: vi.fn().mockResolvedValue(1),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      async (
        operation: (current: typeof client) => Promise<unknown>,
        maximumTimeoutMs?: number,
      ) => {
        const result = operation(client);
        if (maximumTimeoutMs === undefined) return result;
        return Promise.race([
          result,
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error("Redis command timed out")),
              maximumTimeoutMs,
            );
          }),
        ]);
      },
    );
    mocks.refreshAccessToken.mockImplementation(
      async (_token: string, _provider: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const refresh = refreshSessionOidcTokens(
      session("stalled-distributed-renewal") as never,
      "demo",
    );
    const rejection = expect(refresh).rejects.toThrow(
      "Could not renew the distributed OIDC refresh lease",
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.runRedisCommand).toHaveBeenLastCalledWith(
      expect.any(Function),
      2_000,
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
  });

  it("starts token refresh without waiting for leader metrics", async () => {
    const result = {
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };
    const client = {
      get: vi.fn().mockResolvedValue(null),
      eval: vi.fn(
        async (
          _script: string,
          options: { keys: string[]; arguments: string[] },
        ) => {
          if (options.keys.length === 2 && options.arguments.length === 2) {
            return 1;
          }
          return 1;
        },
      ),
      hIncrBy: vi.fn(() => new Promise<never>(() => undefined)),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(result);

    await expect(
      refreshSessionOidcTokens(
        session("non-blocking-leader-metrics") as never,
        "demo",
      ),
    ).resolves.toEqual(result);

    expect(client.hIncrBy).toHaveBeenCalledOnce();
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it("returns a published refresh result without waiting for lock release", async () => {
    const result = {
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 300,
      token_type: "Bearer",
    };
    const client = {
      get: vi.fn().mockResolvedValue(null),
      eval: vi.fn(
        async (
          _script: string,
          options: { keys: string[]; arguments: string[] },
        ) => {
          if (options.keys.length === 1) {
            return new Promise<never>(() => undefined);
          }
          return 1;
        },
      ),
      hIncrBy: vi.fn().mockResolvedValue(1),
    };
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(result);

    await expect(
      refreshSessionOidcTokens(
        session("non-blocking-lock-release") as never,
        "demo",
      ),
    ).resolves.toEqual(result);

    expect(client.eval).toHaveBeenCalledTimes(3);
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
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
