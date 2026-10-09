import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { IronSession } from "iron-session";
import {
  OIDC_REFRESH_TIMEOUT_MS,
  refreshAccessToken,
  type RefreshTokenResult,
} from "@/lib/oidc/sunrise";
import {
  getSessionBackend,
  getRedisCommandTimeoutMs,
  getRedisKeyPrefix,
  runIsolatedRedisCommand,
  runRedisCommand,
} from "@/lib/redis";
import { reloadRedisSession } from "@/lib/session-store";
import type { OidcRefreshCheckpoint, SunriseSession } from "@/lib/session";

const REFRESH_RESULT_REUSE_MS = 30_000;
const MAX_REFRESH_ENTRIES = 256;
const MAX_DISTRIBUTED_REFRESH_LEADERS = 3;
const MAX_DISTRIBUTED_SAVE_ATTEMPTS = 3;
const DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS = 2_000;
const DISTRIBUTED_REFRESH_TIMING_MARGIN_MS = 5_000;

const ACQUIRE_LOCK_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current then
  return current
end
if redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2], "NX") then
  return 1
end
return redis.call("GET", KEYS[1]) or 0
`;

const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

type RefreshEntry = {
  promise: Promise<RefreshTokenResult>;
  reuseUntil?: number;
};

const sunriseRuntime = globalThis as typeof globalThis & {
  sunriseOidcRefreshEntries?: Map<string, RefreshEntry>;
};
const refreshEntries =
  sunriseRuntime.sunriseOidcRefreshEntries ?? new Map<string, RefreshEntry>();
sunriseRuntime.sunriseOidcRefreshEntries = refreshEntries;

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function refreshKey(
  session: IronSession<SunriseSession>,
  identityProvider: string,
  refreshTokenDigest: string,
) {
  const sessionKey = session.sessionId ?? `legacy:${refreshTokenDigest}`;
  return `${identityProvider}\0${sessionKey}`;
}

function distributedRefreshLockKey(key: string) {
  const digest = createHash("sha256").update(key).digest("base64url");
  return `${getRedisKeyPrefix()}:oidc-refresh-lock:${digest}`;
}

function reusableCheckpoint(
  session: SunriseSession,
  identityProvider: string,
  refreshTokenDigest: string,
  now = Date.now(),
): OidcRefreshCheckpoint | undefined {
  const checkpoint = session.oidcRefreshCheckpoint;
  if (
    !checkpoint ||
    checkpoint.identityProvider !== identityProvider ||
    checkpoint.reuseUntil <= now
  ) {
    return undefined;
  }
  if (
    checkpoint.consumedTokenDigest !== refreshTokenDigest &&
    checkpoint.issuedTokenDigest !== refreshTokenDigest
  ) {
    return undefined;
  }
  return checkpoint;
}

function applyRotatedRefreshToken(
  session: IronSession<SunriseSession>,
  result: RefreshTokenResult,
) {
  if (
    result.refresh_token &&
    session.keycloakRefreshToken !== result.refresh_token
  ) {
    session.keycloakRefreshToken = result.refresh_token;
    return true;
  }
  return false;
}

async function releaseDistributedLock(key: string, owner: string) {
  await runIsolatedRedisCommand(
    (client) =>
      client.eval(RELEASE_LOCK_SCRIPT, {
        keys: [key],
        arguments: [owner],
      }),
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
  );
}

async function renewDistributedLock(
  key: string,
  owner: string,
  lockTimeoutMs: number,
) {
  const renewed = await runIsolatedRedisCommand(
    (client) =>
      client.eval(RENEW_LOCK_SCRIPT, {
        keys: [key],
        arguments: [owner, lockTimeoutMs.toString()],
      }),
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
  );
  return Number(renewed) === 1;
}

function distributedRefreshTiming() {
  const sessionCommandTimeoutMs = getRedisCommandTimeoutMs();
  const lockTimeoutMs =
    OIDC_REFRESH_TIMEOUT_MS +
    sessionCommandTimeoutMs +
    DISTRIBUTED_REFRESH_TIMING_MARGIN_MS;
  const checkpointPersistenceMs =
    MAX_DISTRIBUTED_SAVE_ATTEMPTS *
      (sessionCommandTimeoutMs + DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS) +
    DISTRIBUTED_REFRESH_TIMING_MARGIN_MS;
  return {
    checkpointPersistenceMs,
    lockTimeoutMs,
    leaderWaitMs: lockTimeoutMs + checkpointPersistenceMs,
  };
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function reloadCheckpoint(
  session: IronSession<SunriseSession>,
  identityProvider: string,
  refreshTokenDigest: string,
) {
  await reloadRedisSession(session);
  return reusableCheckpoint(session, identityProvider, refreshTokenDigest);
}

async function saveDistributedRefresh(
  session: IronSession<SunriseSession>,
  lockKey: string,
  owner: string,
  lockTimeoutMs: number,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_DISTRIBUTED_SAVE_ATTEMPTS; attempt += 1) {
    try {
      await session.save();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_DISTRIBUTED_SAVE_ATTEMPTS - 1) break;
      try {
        if (!(await renewDistributedLock(lockKey, owner, lockTimeoutMs))) {
          console.warn(
            "[oidc/refresh] lease was lost while preserving a rotated token",
          );
        }
      } catch (renewalError) {
        console.warn(
          "[oidc/refresh] could not renew the lease while preserving a rotated token:",
          renewalError,
        );
      }
      await wait(50 * 2 ** attempt);
    }
  }
  throw new Error("Could not persist the distributed OIDC refresh result", {
    cause: lastError,
  });
}

async function distributedRefresh(
  session: IronSession<SunriseSession>,
  key: string,
  refreshToken: string,
  identityProvider: string,
  refreshTokenDigest: string,
): Promise<RefreshTokenResult> {
  const { checkpointPersistenceMs, lockTimeoutMs, leaderWaitMs } =
    distributedRefreshTiming();
  const existing = await reloadCheckpoint(
    session,
    identityProvider,
    refreshTokenDigest,
  );
  if (existing) return existing.result;

  const authoritativeToken = session.keycloakRefreshToken;
  if (!authoritativeToken) {
    throw new Error("The authoritative Sunrise session has no refresh token");
  }
  if (tokenDigest(authoritativeToken) !== refreshTokenDigest) {
    refreshToken = authoritativeToken;
    refreshTokenDigest = tokenDigest(authoritativeToken);
    key = refreshKey(session, identityProvider, refreshTokenDigest);
  }

  const lockKey = distributedRefreshLockKey(key);
  const startedAt = Date.now();
  const maximumDeadline =
    startedAt + leaderWaitMs * MAX_DISTRIBUTED_REFRESH_LEADERS;
  let followerDeadline = startedAt + leaderWaitMs;
  const observedLeaders = new Set<string>();
  const owner = randomUUID();
  let delayMs = 40;

  while (Date.now() < followerDeadline) {
    const acquisitionResult = await runRedisCommand(
      (client) =>
        client.eval(ACQUIRE_LOCK_SCRIPT, {
          keys: [lockKey],
          arguments: [owner, lockTimeoutMs.toString()],
        }),
      DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
    );

    if (Number(acquisitionResult) === 1) {
      try {
        const checkpoint = await reloadCheckpoint(
          session,
          identityProvider,
          refreshTokenDigest,
        );
        if (checkpoint) return checkpoint.result;
        if (
          !session.keycloakRefreshToken ||
          tokenDigest(session.keycloakRefreshToken) !== refreshTokenDigest
        ) {
          throw new Error(
            "The OIDC refresh token changed while acquiring its lease",
          );
        }
        if (!(await renewDistributedLock(lockKey, owner, lockTimeoutMs))) {
          throw new Error(
            "Lost the distributed OIDC refresh lease before token exchange",
          );
        }

        const result = await refreshAccessToken(refreshToken, identityProvider);
        applyRotatedRefreshToken(session, result);
        session.oidcRefreshCheckpoint = {
          consumedTokenDigest: refreshTokenDigest,
          identityProvider,
          issuedTokenDigest: tokenDigest(result.refresh_token ?? refreshToken),
          result,
          // Keep the checkpoint reusable for the full bounded publication
          // window plus the normal reuse period after publication.
          reuseUntil:
            Date.now() + REFRESH_RESULT_REUSE_MS + checkpointPersistenceMs,
        };
        // After Keycloak consumes a single-use token, preserving its result is
        // safer than discarding it on an uncertain lease renewal. Session CAS
        // and revocation checks remain the authority for the following write.
        try {
          if (!(await renewDistributedLock(lockKey, owner, lockTimeoutMs))) {
            console.warn(
              "[oidc/refresh] lease expired after token rotation; preserving the result",
            );
          }
        } catch (error) {
          console.warn(
            "[oidc/refresh] could not renew the lease after token rotation; preserving the result:",
            error,
          );
        }
        await saveDistributedRefresh(session, lockKey, owner, lockTimeoutMs);
        return result;
      } finally {
        await releaseDistributedLock(lockKey, owner).catch((error) => {
          console.warn("[oidc/refresh] failed to release Redis lock:", error);
        });
      }
    }

    if (typeof acquisitionResult === "string") {
      if (!observedLeaders.has(acquisitionResult)) {
        if (observedLeaders.size >= MAX_DISTRIBUTED_REFRESH_LEADERS) break;
        observedLeaders.add(acquisitionResult);
      }
      followerDeadline = Math.min(
        maximumDeadline,
        Math.max(followerDeadline, Date.now() + leaderWaitMs),
      );
    }

    await wait(delayMs);
    const checkpoint = await reloadCheckpoint(
      session,
      identityProvider,
      refreshTokenDigest,
    );
    if (checkpoint) return checkpoint.result;
    delayMs = Math.min(delayMs * 2, 250);
  }

  throw new Error("Timed out waiting for the distributed OIDC refresh result");
}

function pruneRefreshEntries(now: number) {
  for (const [key, entry] of refreshEntries) {
    if (entry.reuseUntil !== undefined && entry.reuseUntil <= now) {
      refreshEntries.delete(key);
    }
  }

  while (refreshEntries.size >= MAX_REFRESH_ENTRIES) {
    let completedKey: string | undefined;
    for (const [key, entry] of refreshEntries) {
      if (entry.reuseUntil !== undefined) {
        completedKey = key;
        break;
      }
    }
    if (!completedKey) break;
    refreshEntries.delete(completedKey);
  }
}

/**
 * Coalesces OIDC refresh-token rotation for requests using one logical
 * Sunrise session. Redis-backed leaders persist the rotated token and reusable
 * result in the versioned session record before releasing their lease.
 */
export async function refreshSessionOidcTokens(
  session: IronSession<SunriseSession>,
  identityProvider: string,
): Promise<RefreshTokenResult | undefined> {
  const refreshToken = session.keycloakRefreshToken;
  if (!refreshToken) return undefined;

  const now = Date.now();
  pruneRefreshEntries(now);
  const sessionBackend = getSessionBackend();

  const refreshTokenDigest = tokenDigest(refreshToken);
  const key = refreshKey(session, identityProvider, refreshTokenDigest);
  const existing = refreshEntries.get(key);
  const canReuseExisting =
    existing &&
    (existing.reuseUntil === undefined || existing.reuseUntil > now);

  if (canReuseExisting) {
    const result = await existing.promise;
    if (applyRotatedRefreshToken(session, result)) {
      await session.save();
    }
    return result;
  }

  if (
    sessionBackend === "cookie" &&
    refreshEntries.size >= MAX_REFRESH_ENTRIES
  ) {
    throw new Error("Too many concurrent OIDC session refreshes");
  }

  const refreshPromise =
    sessionBackend === "redis"
      ? distributedRefresh(
          session,
          key,
          refreshToken,
          identityProvider,
          refreshTokenDigest,
        )
      : refreshAccessToken(refreshToken, identityProvider);
  const entry: RefreshEntry = { promise: refreshPromise };
  entry.promise = refreshPromise
    .then((result) => {
      entry.reuseUntil = Date.now() + REFRESH_RESULT_REUSE_MS;
      return result;
    })
    .catch((error) => {
      if (refreshEntries.get(key) === entry) refreshEntries.delete(key);
      throw error;
    });
  if (refreshEntries.size < MAX_REFRESH_ENTRIES) {
    refreshEntries.set(key, entry);
  }

  const result = await entry.promise;
  if (applyRotatedRefreshToken(session, result)) {
    await session.save();
  }
  return result;
}
