import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getSessionBackend: vi.fn(() => "cookie"),
  getRedisCommandTimeoutMs: vi.fn(() => 2_000),
  getRedisKeyPrefix: vi.fn(() => "sunrise"),
  getRedisServerTimeMs: vi.fn(() => Promise.resolve(Date.now())),
  reloadRedisSession: vi.fn(),
  saveRedisSession: vi.fn(),
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
  getRedisServerTimeMs: mocks.getRedisServerTimeMs,
  runIsolatedRedisCommand: mocks.runIsolatedRedisCommand,
  runRedisCommand: mocks.runRedisCommand,
}));
vi.mock("@/lib/session-store", () => ({
  REDIS_SESSION_MAX_SAVE_ATTEMPTS: 4,
  reloadRedisSession: mocks.reloadRedisSession,
  saveRedisSession: mocks.saveRedisSession,
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
    mocks.getRedisServerTimeMs.mockImplementation(async () => Date.now());
    mocks.reloadRedisSession.mockResolvedValue(undefined);
    mocks.saveRedisSession.mockImplementation((current) => current.save());
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

  it("does not reuse a cookie result after an interactive continuation", async () => {
    const firstResult = refreshedTokens();
    const continuationResult = {
      ...refreshedTokens(),
      access_token: "continuation-access-token",
      refresh_token: "continuation-rotated-refresh-token",
    };
    mocks.refreshAccessToken
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(continuationResult);
    const first = session("cookie-continuation");
    await refreshSessionOidcTokens(first as never, "demo");

    const continued = session(
      "cookie-continuation",
      "interactive-continuation-token",
    );
    await expect(
      refreshSessionOidcTokens(continued as never, "demo"),
    ).resolves.toEqual(continuationResult);

    expect(mocks.refreshAccessToken).toHaveBeenNthCalledWith(
      2,
      "interactive-continuation-token",
      "demo",
    );
    expect(continued.keycloakRefreshToken).toBe(
      "continuation-rotated-refresh-token",
    );
  });

  it("does not locally reuse an access token inside its safety margin", async () => {
    mocks.refreshAccessToken.mockResolvedValue({
      ...refreshedTokens(),
      expires_in: 3,
    });
    const current = session("cookie-short-access-token");

    await refreshSessionOidcTokens(current as never, "demo");
    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("reuses a refresh checkpoint from the authoritative Redis session", async () => {
    const result = refreshedTokens();
    const current = session("redis-checkpoint", "rotated-refresh-token");
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

  it("evaluates shared checkpoints using Redis time on a fast-clock replica", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(9_000_000);
    const redisNow = 1_000_000;
    const result = refreshedTokens();
    const current = session("redis-fast-local-clock", "rotated-refresh-token");
    Object.assign(current, {
      oidcRefreshCheckpoint: {
        consumedTokenDigest: digest("old-refresh-token"),
        identityProvider: "demo",
        issuedTokenDigest: digest("rotated-refresh-token"),
        result,
        reuseUntil: redisNow + 30_000,
      },
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.getRedisServerTimeMs.mockResolvedValue(redisNow);

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(result);

    expect(mocks.getRedisServerTimeMs).toHaveBeenCalledWith(2_000);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("rejects an expired shared checkpoint on a slow-clock replica", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(500_000);
    const redisNow = 1_000_000;
    const current = session("redis-slow-local-clock", "rotated-refresh-token");
    Object.assign(current, {
      oidcRefreshCheckpoint: {
        consumedTokenDigest: digest("old-refresh-token"),
        identityProvider: "demo",
        issuedTokenDigest: digest("rotated-refresh-token"),
        result: refreshedTokens(),
        reuseUntil: redisNow - 1,
      },
    });
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.getRedisServerTimeMs.mockResolvedValue(redisNow);
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(refreshedTokens());

    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it("refreshes when Redis expires a locally cached checkpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(9_000_000);
    let redisNow = 1_000_000;
    const current = session("redis-local-clock-revalidation");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.getRedisServerTimeMs.mockImplementation(async () => redisNow);
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");
    redisNow = 1_200_000;
    vi.setSystemTime(9_001_000);
    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("rejects a checkpoint superseded by a continuation token", async () => {
    const result = refreshedTokens();
    const current = session("redis-superseded-checkpoint");
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
    mocks.reloadRedisSession.mockImplementation(async () => {
      current.keycloakRefreshToken = "interactive-continuation-token";
    });

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(mocks.runRedisCommand).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(current.save).not.toHaveBeenCalled();
  });

  it("rejects process-local reuse superseded by a continuation", async () => {
    const leader = session("redis-local-superseded");
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

    await refreshSessionOidcTokens(leader as never, "demo");
    const stale = session("redis-local-superseded");
    mocks.reloadRedisSession.mockImplementation(async (active) => {
      Object.assign(active, {
        keycloakRefreshToken: "interactive-continuation-token",
        oidcSessionContinuation: true,
      });
    });

    await expect(
      refreshSessionOidcTokens(stale as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(stale.save).not.toHaveBeenCalled();

    Object.assign(stale, {
      keycloakRefreshToken: "interactive-continuation-token",
      oidcSessionContinuation: undefined,
    });
    mocks.reloadRedisSession.mockResolvedValue(undefined);
    await refreshSessionOidcTokens(stale as never, "demo");
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("rejects process-local reuse after a continuation completes", async () => {
    const leader = session("redis-local-completed-continuation");
    const stale = session("redis-local-completed-continuation");
    Object.assign(leader, {
      federationIdentityProvider: "demo",
      oidcSessionGeneration: "generation-1",
    });
    Object.assign(stale, {
      federationIdentityProvider: "demo",
      oidcSessionGeneration: "generation-1",
    });
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

    await refreshSessionOidcTokens(leader as never, "demo");
    mocks.reloadRedisSession.mockImplementation(async (active) => {
      if (active === stale) {
        Object.assign(active, {
          keycloakRefreshToken: "interactive-continuation-token",
          oidcRefreshCheckpoint: undefined,
          oidcSessionGeneration: "generation-2",
        });
      }
    });

    await expect(
      refreshSessionOidcTokens(stale as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(stale.save).not.toHaveBeenCalled();
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
    expect(client.eval.mock.calls[0][1].arguments[1]).toBe("45000");
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

  it("renews the refresh lease inside a session CAS retry", async () => {
    const current = session("redis-cas-retry");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.saveRedisSession.mockImplementation(async (active, options) => {
      await options.beforeConflictRetry();
      await active.save();
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.saveRedisSession).toHaveBeenCalledWith(current, {
      beforeConflictRetry: expect.any(Function),
      maximumCommandTimeoutMs: 2_000,
      validateConflictRetry: expect.any(Function),
    });
    expect(
      client.eval.mock.calls.filter(([script]) => script.includes("PEXPIRE")),
    ).toHaveLength(3);
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("preserves a continuation token published during a refresh", async () => {
    const current = session("redis-continuation-race");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementation(async () => {
      if (mocks.refreshAccessToken.mock.calls.length > 0) {
        current.keycloakRefreshToken = "interactive-continuation-token";
      }
    });
    mocks.saveRedisSession.mockImplementation(async (active) => active.save());
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(current.keycloakRefreshToken).toBe(
      "interactive-continuation-token",
    );
    expect(current).not.toHaveProperty("oidcRefreshCheckpoint");
    expect(current.save).not.toHaveBeenCalled();
  });

  it("aborts while an interactive continuation is active", async () => {
    const current = session("redis-continuation-active");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementation(async () => {
      if (mocks.refreshAccessToken.mock.calls.length > 0) {
        Object.assign(current, { oidcSessionContinuation: true });
      }
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(current.keycloakRefreshToken).toBe("old-refresh-token");
    expect(current).not.toHaveProperty("oidcRefreshCheckpoint");
    expect(current.save).not.toHaveBeenCalled();
  });

  it("preserves a continuation token published during checkpoint CAS", async () => {
    const current = session("redis-continuation-cas-race");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.saveRedisSession.mockImplementation(async (active, options) => {
      const authoritative = {
        keycloakRefreshToken: "interactive-continuation-token",
      };
      await options.beforeConflictRetry();
      options.validateConflictRetry(authoritative);
      await active.save();
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(current.save).not.toHaveBeenCalled();
  });

  it("accepts an identical checkpoint after an uncertain Redis write", async () => {
    const current = session("redis-uncertain-write");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.saveRedisSession.mockImplementation(async (active, options) => {
      options.validateConflictRetry({
        keycloakRefreshToken: "rotated-refresh-token",
        oidcRefreshCheckpoint: active.oidcRefreshCheckpoint,
      });
      await active.save();
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(refreshedTokens());
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("aborts when a continuation starts after checkpoint persistence", async () => {
    const current = session("redis-post-persistence-continuation");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    let reloadCount = 0;
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementation(async () => {
      reloadCount += 1;
      if (reloadCount === 4) {
        Object.assign(current, {
          keycloakRefreshToken: "interactive-continuation-token",
          oidcRefreshCheckpoint: undefined,
          oidcSessionContinuation: true,
        });
      }
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    expect(current.keycloakRefreshToken).toBe(
      "interactive-continuation-token",
    );
  });

  it("does not reuse a checkpoint past the access-token lifetime", async () => {
    const current = session("redis-short-access-token");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    const startedAt = Date.now();
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue({
      ...refreshedTokens(),
      expires_in: 60,
    });

    await refreshSessionOidcTokens(current as never, "demo");

    const checkpoint = (
      current as typeof current & {
        oidcRefreshCheckpoint: { reuseUntil: number };
      }
    ).oidcRefreshCheckpoint;
    expect(checkpoint.reuseUntil).toBeGreaterThanOrEqual(startedAt + 55_000);
    expect(checkpoint.reuseUntil).toBeLessThan(startedAt + 56_000);
  });

  it("does not extend local reuse while persisting a checkpoint", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const current = session("redis-slow-checkpoint-expiry");
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.saveRedisSession.mockImplementation(async (active) => {
      vi.setSystemTime(startedAt + 40_000);
      await active.save();
    });
    mocks.refreshAccessToken.mockResolvedValue({
      ...refreshedTokens(),
      expires_in: 60,
    });

    await refreshSessionOidcTokens(current as never, "demo");
    vi.setSystemTime(startedAt + 56_000);
    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("re-refreshes when persistence outlives the access token", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const current = session("redis-expired-during-persistence");
    const firstResult = {
      ...refreshedTokens(),
      access_token: "first-access-token",
      refresh_token: "first-rotated-refresh-token",
      expires_in: 60,
    };
    const finalResult = {
      ...refreshedTokens(),
      access_token: "final-access-token",
      refresh_token: "final-rotated-refresh-token",
    };
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    let saveCount = 0;
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.saveRedisSession.mockImplementation(async (active) => {
      saveCount += 1;
      if (saveCount === 1) vi.setSystemTime(startedAt + 56_000);
      await active.save();
    });
    mocks.refreshAccessToken
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(finalResult);

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).resolves.toEqual(finalResult);

    expect(mocks.refreshAccessToken).toHaveBeenNthCalledWith(
      1,
      "old-refresh-token",
      "demo",
    );
    expect(mocks.refreshAccessToken).toHaveBeenNthCalledWith(
      2,
      "first-rotated-refresh-token",
      "demo",
    );
    expect(current.keycloakRefreshToken).toBe(
      "final-rotated-refresh-token",
    );
    expect(current).toMatchObject({
      oidcRefreshCheckpoint: {
        ancestorTokenDigests: [digest("old-refresh-token")],
        consumedTokenDigest: digest("first-rotated-refresh-token"),
        issuedTokenDigest: digest("final-rotated-refresh-token"),
      },
    });
    expect(current.save).toHaveBeenCalledTimes(2);
  });

  it("shares a re-refreshed result with local followers", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const leader = session("redis-local-generation-follower");
    const follower = session("redis-local-generation-follower");
    const leaderWithCheckpoint = leader as typeof leader & {
      oidcRefreshCheckpoint?: {
        result: { access_token: string };
      };
    };
    const firstResult = {
      ...refreshedTokens(),
      access_token: "first-access-token",
      refresh_token: "first-rotated-refresh-token",
      expires_in: 60,
    };
    const finalResult = {
      ...refreshedTokens(),
      access_token: "final-access-token",
      refresh_token: "final-rotated-refresh-token",
    };
    const client = redisClient((script) => {
      if (script.includes('"NX"')) return 1;
      return 1;
    });
    let saveCount = 0;
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementation(async (active) => {
      if (
        active === follower &&
        leaderWithCheckpoint.oidcRefreshCheckpoint?.result.access_token ===
          finalResult.access_token
      ) {
        Object.assign(active, {
          keycloakRefreshToken: leader.keycloakRefreshToken,
          oidcRefreshCheckpoint: leaderWithCheckpoint.oidcRefreshCheckpoint,
        });
      }
    });
    mocks.saveRedisSession.mockImplementation(async (active) => {
      saveCount += 1;
      if (saveCount === 1) vi.setSystemTime(startedAt + 56_000);
      await active.save();
    });
    mocks.refreshAccessToken
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(finalResult);

    await expect(
      Promise.all([
        refreshSessionOidcTokens(leader as never, "demo"),
        refreshSessionOidcTokens(follower as never, "demo"),
      ]),
    ).resolves.toEqual([finalResult, finalResult]);

    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(follower.keycloakRefreshToken).toBe(
      "final-rotated-refresh-token",
    );
    expect(follower.save).not.toHaveBeenCalled();
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

  it("restarts a follower with an authoritative rotated token", async () => {
    vi.useFakeTimers();
    const current = session("redis-expired-follower-checkpoint");
    const result = {
      ...refreshedTokens(),
      refresh_token: "second-rotated-refresh-token",
    };
    let acquisitionCount = 0;
    let reloadCount = 0;
    const client = redisClient((script) => {
      if (!script.includes('"NX"')) return 1;
      acquisitionCount += 1;
      return acquisitionCount === 1 ? "slow-owner" : 1;
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementation(async () => {
      reloadCount += 1;
      if (reloadCount === 2) {
        current.keycloakRefreshToken = "first-rotated-refresh-token";
        Object.assign(current, {
          oidcRefreshCheckpoint: {
            consumedTokenDigest: digest("old-refresh-token"),
            identityProvider: "demo",
            issuedTokenDigest: digest("first-rotated-refresh-token"),
            result: refreshedTokens(),
            reuseUntil: Date.now() - 1,
          },
        });
      }
    });
    mocks.refreshAccessToken.mockResolvedValue(result);

    const refresh = refreshSessionOidcTokens(current as never, "demo");
    await vi.advanceTimersByTimeAsync(40);

    await expect(refresh).resolves.toEqual(result);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "first-rotated-refresh-token",
      "demo",
    );
    expect(current.keycloakRefreshToken).toBe(
      "second-rotated-refresh-token",
    );
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
    expect(client.eval.mock.calls[0][1].arguments[1]).toBe("73000");
  });

  it("rejects a token from a newer OIDC generation before lock acquisition", async () => {
    const current = session("redis-newer-oidc-generation");
    Object.assign(current, {
      federationIdentityProvider: "demo",
      oidcSessionGeneration: "generation-1",
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      Object.assign(current, {
        keycloakRefreshToken: "interactive-continuation-token",
        oidcSessionGeneration: "generation-2",
      });
    });

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");

    expect(mocks.runRedisCommand).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a token from a different provider before lock acquisition", async () => {
    const current = session("redis-newer-oidc-provider");
    Object.assign(current, {
      federationIdentityProvider: "demo",
      oidcSessionGeneration: "generation-1",
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      Object.assign(current, {
        federationIdentityProvider: "other-provider",
        keycloakRefreshToken: "other-provider-refresh-token",
      });
    });

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");

    expect(mocks.runRedisCommand).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a changed token without checkpoint lineage", async () => {
    const current = session("redis-unproven-token-change");
    Object.assign(current, {
      federationIdentityProvider: "demo",
      oidcSessionGeneration: "generation-1",
    });
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      current.keycloakRefreshToken = "unproven-refresh-token";
    });

    await expect(
      refreshSessionOidcTokens(current as never, "demo"),
    ).rejects.toThrow("superseded by an interactive continuation");

    expect(mocks.runRedisCommand).not.toHaveBeenCalled();
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes a rotated token with persisted checkpoint lineage", async () => {
    const current = session("redis-authoritative-token");
    const client = redisClient((script) => (script.includes('"NX"') ? 1 : 1));
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      current.keycloakRefreshToken = "newer-refresh-token";
      Object.assign(current, {
        oidcRefreshCheckpoint: {
          consumedTokenDigest: digest("old-refresh-token"),
          identityProvider: "demo",
          issuedTokenDigest: digest("newer-refresh-token"),
          result: refreshedTokens(),
          reuseUntil: Date.now() - 1,
        },
      });
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "newer-refresh-token",
      "demo",
    );
  });

  it("refreshes the latest token through bounded multi-hop lineage", async () => {
    const current = session("redis-multi-hop-lineage");
    const client = redisClient((script) => (script.includes('"NX"') ? 1 : 1));
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.reloadRedisSession.mockImplementationOnce(async () => {
      current.keycloakRefreshToken = "second-rotated-refresh-token";
      Object.assign(current, {
        oidcRefreshCheckpoint: {
          ancestorTokenDigests: [digest("old-refresh-token")],
          consumedTokenDigest: digest("first-rotated-refresh-token"),
          identityProvider: "demo",
          issuedTokenDigest: digest("second-rotated-refresh-token"),
          result: refreshedTokens(),
          reuseUntil: Date.now() - 1,
        },
      });
    });
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "second-rotated-refresh-token",
      "demo",
    );
  });

  it("bounds persisted lineage to the distributed refresh generation limit", async () => {
    const current = session("redis-bounded-lineage", "current-refresh-token");
    Object.assign(current, {
      oidcRefreshCheckpoint: {
        ancestorTokenDigests: [
          digest("old-refresh-token"),
          digest("older-refresh-token"),
          digest("oldest-refresh-token"),
        ],
        consumedTokenDigest: digest("previous-refresh-token"),
        identityProvider: "demo",
        issuedTokenDigest: digest("current-refresh-token"),
        result: refreshedTokens(),
        reuseUntil: Date.now() - 1,
      },
    });
    const client = redisClient((script) => (script.includes('"NX"') ? 1 : 1));
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.runRedisCommand.mockImplementation(
      (operation: (active: typeof client) => Promise<unknown>) =>
        operation(client),
    );
    mocks.refreshAccessToken.mockResolvedValue(refreshedTokens());

    await refreshSessionOidcTokens(current as never, "demo");

    expect(current).toMatchObject({
      oidcRefreshCheckpoint: {
        ancestorTokenDigests: [
          digest("previous-refresh-token"),
          digest("old-refresh-token"),
        ],
        consumedTokenDigest: digest("current-refresh-token"),
      },
    });
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
