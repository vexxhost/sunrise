import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getSessionBackend: vi.fn(() => "cookie"),
  getRedisCommandTimeoutMs: vi.fn(() => 2_000),
  getRedisKeyPrefix: vi.fn(() => "sunrise"),
  reloadRedisSession: vi.fn(),
  runIsolatedRedisCommand: vi.fn(),
  runRedisCommand: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/oidc/sunrise", () => ({
  OIDC_REFRESH_TIMEOUT_MS: 30_000,
  refreshAccessToken: mocks.refreshAccessToken,
}));
vi.mock("@/lib/redis", () => ({
  getSessionBackend: mocks.getSessionBackend,
  getRedisCommandTimeoutMs: mocks.getRedisCommandTimeoutMs,
  getRedisKeyPrefix: mocks.getRedisKeyPrefix,
  runIsolatedRedisCommand: mocks.runIsolatedRedisCommand,
  runRedisCommand: mocks.runRedisCommand,
}));
vi.mock("@/lib/session-store", () => ({
  reloadRedisSession: mocks.reloadRedisSession,
}));

import { refreshSessionOidcTokens } from "@/lib/oidc/session-refresh";

function digest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function refreshedTokens() {
  return {
    access_token: "new-access-token",
    refresh_token: "rotated-refresh-token",
    expires_in: 300,
    token_type: "Bearer",
  };
}

function session(sessionId: string, refreshToken = "old-refresh-token") {
  return {
    sessionId,
    keycloakRefreshToken: refreshToken,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function redisClient(
  evaluate: (script: string, options: { arguments: string[] }) => unknown,
) {
  return {
    eval: vi.fn(
      async (
        script: string,
        options: { keys: string[]; arguments: string[] },
      ) => evaluate(script, options),
    ),
  };
}

describe("OIDC session token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionBackend.mockReturnValue("cookie");
    mocks.getRedisCommandTimeoutMs.mockReturnValue(2_000);
    mocks.reloadRedisSession.mockResolvedValue(undefined);
    mocks.runIsolatedRedisCommand.mockImplementation(
      (
        operation: (client: unknown) => Promise<unknown>,
        maximumTimeoutMs?: number,
      ) => mocks.runRedisCommand(operation, maximumTimeoutMs),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces concurrent cookie-session refreshes", async () => {
    let resolveRefresh:
      ((value: ReturnType<typeof refreshedTokens>) => void) | undefined;
    mocks.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const first = session("cookie-concurrent");
    const second = session("cookie-concurrent");

    const firstRefresh = refreshSessionOidcTokens(first as never, "demo");
    const secondRefresh = refreshSessionOidcTokens(second as never, "demo");
    resolveRefresh?.(refreshedTokens());

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      refreshedTokens(),
      refreshedTokens(),
    ]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(first.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(second.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(first.save).toHaveBeenCalledOnce();
    expect(second.save).toHaveBeenCalledOnce();
  });

  it("reuses a completed local refresh for old and rotated tokens", async () => {
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());
    const first = session("cookie-reuse");
    await refreshSessionOidcTokens(first as never, "demo");

    const stale = session("cookie-reuse");
    const rotated = session("cookie-reuse", "rotated-refresh-token");
    await refreshSessionOidcTokens(stale as never, "demo");
    await refreshSessionOidcTokens(rotated as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(stale.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(first.save).toHaveBeenCalledOnce();
    expect(stale.save).toHaveBeenCalledOnce();
    expect(rotated.save).not.toHaveBeenCalled();
  });

  it("reuses a refresh checkpoint from the authoritative Redis session", async () => {
    const result = refreshedTokens();
    const current = session("redis-checkpoint");
    Object.assign(current, {
      oidcRefreshCheckpoint: {
        consumedTokenDigest: digest("old-refresh-token"),
        identityProvider: "demo",
        issuedTokenDigest: digest("rotated-refresh-token"),
        result,
        reuseUntil: Date.now() + 30_000,
      },
    });
    mocks.getSessionBackend.mockReturnValue("redis");

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(result);

    expect(mocks.reloadRedisSession).toHaveBeenCalledOnce();
    expect(mocks.runRedisCommand).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
  });

  it("persists a rotated token and checkpoint before releasing the lease", async () => {
    const current = session("redis-leader");
    const startedAt = Date.now();
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(refreshedTokens());

    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(current).toMatchObject({
      oidcRefreshCheckpoint: {
        consumedTokenDigest: digest("old-refresh-token"),
        identityProvider: "demo",
        issuedTokenDigest: digest("rotated-refresh-token"),
        result: refreshedTokens(),
      },
    });
    expect(
      (
        current as typeof current & {
          oidcRefreshCheckpoint: { reuseUntil: number };
        }
      ).oidcRefreshCheckpoint.reuseUntil,
    ).toBeGreaterThanOrEqual(startedAt + 47_000);
    expect(current.save).toHaveBeenCalledOnce();
    expect(current.save.mock.invocationCallOrder[0]).toBeLessThan(
      client.eval.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("retries a transient checkpoint save while retaining the lease", async () => {
    const current = session("redis-save-retry");
    current.save
      .mockRejectedValueOnce(new Error("Redis connection reset"))
      .mockResolvedValueOnce(undefined);
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(refreshedTokens());

    expect(current.save).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(mocks.runIsolatedRedisCommand).toHaveBeenCalledWith(
      expect.any(Function),
      2_000,
    );
  });

  it("persists a rotated token when post-exchange lease renewal fails", async () => {
    const current = session("redis-renewal-failure");
    let renewals = 0;
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      if (script.includes("PEXPIRE") && ++renewals === 2) {
        throw new Error("Redis connection reset");
      }
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(refreshedTokens());

    expect(current.keycloakRefreshToken).toBe("rotated-refresh-token");
    expect(current.save).toHaveBeenCalledOnce();
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it("follows another leader by reloading the session checkpoint", async () => {
    vi.useFakeTimers();
    const current = session("redis-follower");
    const result = refreshedTokens();
    const client = redisClient(() => "other-owner");
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        current.keycloakRefreshToken = "rotated-refresh-token";
        Object.assign(current, {
          oidcRefreshCheckpoint: {
            consumedTokenDigest: digest("old-refresh-token"),
            identityProvider: "demo",
            issuedTokenDigest: digest("rotated-refresh-token"),
            result,
            reuseUntil: Date.now() + 30_000,
          },
        });
      });

    const refresh = refreshSessionOidcTokens(current as never, "demo");
    await vi.advanceTimersByTimeAsync(40);

    await expect(refresh).resolves.toEqual(result);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(current.save).not.toHaveBeenCalled();
  });

  it("waits through every checkpoint save attempt in the Redis budget", async () => {
    vi.useFakeTimers();
    const current = session("redis-slow-follower");
    const result = refreshedTokens();
    const client = redisClient(() => "slow-owner");
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.getRedisCommandTimeoutMs.mockReturnValue(30_000);
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    setTimeout(() => {
      current.keycloakRefreshToken = "rotated-refresh-token";
      Object.assign(current, {
        oidcRefreshCheckpoint: {
          consumedTokenDigest: digest("old-refresh-token"),
          identityProvider: "demo",
          issuedTokenDigest: digest("rotated-refresh-token"),
          result,
          reuseUntil: Date.now() + 30_000,
        },
      });
    }, 150_000);

    const refresh = refreshSessionOidcTokens(current as never, "demo");
    await vi.advanceTimersByTimeAsync(151_000);

    await expect(refresh).resolves.toEqual(result);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes the latest token loaded before lock acquisition", async () => {
    const current = session("redis-authoritative-token");
    const client = redisClient((script) => (script.includes('"NX"') ? 1 : 1));
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      current.keycloakRefreshToken = "newer-refresh-token";
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "newer-refresh-token",
      "demo",
    );
  });

  it("does not persist a result after losing the distributed lease", async () => {
    const current = session("redis-lost-lease");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      if (script.includes("PEXPIRE")) return 0;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("Lost the distributed OIDC refresh lease");
    expect(current.save).not.toHaveBeenCalled();
    expect(current).not.toHaveProperty("oidcRefreshCheckpoint");
    expect(mocks.runIsolatedRedisCommand).toHaveBeenCalledWith(
      expect.any(Function),
      2_000,
    );
  });

  it("does nothing when the session has no refresh token", async () => {
    await expect(
      refreshSessionOidcTokens({ sessionId: "missing-token" } as never, "demo"),
    ).resolves.toBeUndefined();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("fails closed when cookie refresh coalescing is saturated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    let resolveRefresh:
      ((value: ReturnType<typeof refreshedTokens>) => void) | undefined;
    const pendingRefresh = new Promise<ReturnType<typeof refreshedTokens>>(
      (resolve) => {
        resolveRefresh = resolve;
      },
    );
    mocks.refreshAccessToken.mockReturnValue(pendingRefresh);

    const active = Array.from({ length: 256 }, (_, index) =>
      refreshSessionOidcTokens(session(`capacity-${index}`) as never, "demo"),
    );
    await expect(
      refreshSessionOidcTokens(session("capacity-overflow") as never, "demo"),
    ).rejects.toThrow("Too many concurrent OIDC session refreshes");

    resolveRefresh?.(refreshedTokens());
    await expect(Promise.all(active)).resolves.toHaveLength(256);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(256);
  });
});
