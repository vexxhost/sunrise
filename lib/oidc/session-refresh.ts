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
  getRedisServerTimeMs,
  runIsolatedRedisCommand,
  runRedisCommand,
} from "@/lib/redis";
import {
  REDIS_SESSION_MAX_SAVE_ATTEMPTS,
  reloadRedisSession,
  saveRedisSession,
} from "@/lib/session-store";
import type { OidcRefreshCheckpoint, SunriseSession } from "@/lib/session";

const REFRESH_RESULT_REUSE_MS = 30_000;
const ACCESS_TOKEN_REUSE_MARGIN_MS = 5_000;
const MAX_REFRESH_ENTRIES = 256;
const MAX_DISTRIBUTED_REFRESH_LEADERS = 3;
const MAX_DISTRIBUTED_REFRESH_GENERATIONS = 3;
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
  consumedTokenDigest: string;
  issuedTokenDigest?: string;
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
  now: number,
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

class SupersededOidcRefreshError extends Error {
  constructor() {
    super("The OIDC refresh was superseded by an interactive continuation");
    this.name = "SupersededOidcRefreshError";
  }
}

function assertRefreshStillAuthoritative(
  session: Readonly<SunriseSession>,
  consumedTokenDigest: string,
) {
  const authoritativeToken = session.keycloakRefreshToken;
  if (
    session.oidcSessionContinuation ||
    !authoritativeToken ||
    tokenDigest(authoritativeToken) !== consumedTokenDigest
  ) {
    throw new SupersededOidcRefreshError();
  }
}

function authoritativeRefreshToken(session: Readonly<SunriseSession>) {
  const refreshToken = session.keycloakRefreshToken;
  if (session.oidcSessionContinuation || !refreshToken) {
    throw new SupersededOidcRefreshError();
  }
  return {
    refreshToken,
    refreshTokenDigest: tokenDigest(refreshToken),
  };
}

function changedAuthoritativeRefreshToken(
  session: Readonly<SunriseSession>,
  consumedTokenDigest: string,
) {
  const authoritative = authoritativeRefreshToken(session);
  return authoritative.refreshTokenDigest === consumedTokenDigest
    ? undefined
    : authoritative;
}

function assertCheckpointStillAuthoritative(
  session: Readonly<SunriseSession>,
  checkpoint: OidcRefreshCheckpoint | undefined,
) {
  const authoritativeToken = session.keycloakRefreshToken;
  if (
    session.oidcSessionContinuation ||
    !checkpoint ||
    !authoritativeToken ||
    tokenDigest(authoritativeToken) !== checkpoint.issuedTokenDigest
  ) {
    throw new SupersededOidcRefreshError();
  }
}

function sameRefreshResult(
  left: RefreshTokenResult,
  right: RefreshTokenResult,
) {
  return (
    left.access_token === right.access_token &&
    left.id_token === right.id_token &&
    left.refresh_token === right.refresh_token &&
    left.expires_in === right.expires_in &&
    left.token_type === right.token_type
  );
}

function reusableCheckpointForResult(
  session: SunriseSession,
  identityProvider: string,
  result: RefreshTokenResult,
  now: number,
) {
  const checkpoint = session.oidcRefreshCheckpoint;
  if (
    !checkpoint ||
    checkpoint.identityProvider !== identityProvider ||
    checkpoint.reuseUntil <= now ||
    !sameRefreshResult(checkpoint.result, result)
  ) {
    return undefined;
  }
  return checkpoint;
}

function assertRefreshConflictIsSafe(
  authoritative: Readonly<SunriseSession>,
  consumedTokenDigest: string,
  expectedCheckpoint: OidcRefreshCheckpoint | undefined,
) {
  const authoritativeToken = authoritative.keycloakRefreshToken;
  if (authoritative.oidcSessionContinuation || !authoritativeToken) {
    throw new SupersededOidcRefreshError();
  }

  const authoritativeTokenDigest = tokenDigest(authoritativeToken);
  if (authoritativeTokenDigest === consumedTokenDigest) return;

  const authoritativeCheckpoint = authoritative.oidcRefreshCheckpoint;
  if (
    expectedCheckpoint &&
    authoritativeCheckpoint &&
    authoritativeCheckpoint.identityProvider ===
      expectedCheckpoint.identityProvider &&
    authoritativeCheckpoint.consumedTokenDigest === consumedTokenDigest &&
    authoritativeCheckpoint.issuedTokenDigest ===
      expectedCheckpoint.issuedTokenDigest &&
    authoritativeTokenDigest === authoritativeCheckpoint.issuedTokenDigest &&
    sameRefreshResult(
      authoritativeCheckpoint.result,
      expectedCheckpoint.result,
    )
  ) {
    return;
  }

  throw new SupersededOidcRefreshError();
}

function checkpointReuseUntil(
  result: RefreshTokenResult,
  checkpointPersistenceMs: number,
  now = Date.now(),
) {
  const publicationWindow =
    now + REFRESH_RESULT_REUSE_MS + checkpointPersistenceMs;
  const expiresInSeconds = Number.isFinite(result.expires_in)
    ? Math.max(0, result.expires_in)
    : 0;
  const accessTokenLifetimeMs = expiresInSeconds * 1_000;
  const accessTokenWindow =
    now + Math.max(0, accessTokenLifetimeMs - ACCESS_TOKEN_REUSE_MARGIN_MS);
  return Math.min(publicationWindow, accessTokenWindow);
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
  const refreshRedisOperationBudgetMs =
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS + 2_000;
  const lockTimeoutMs =
    OIDC_REFRESH_TIMEOUT_MS +
    sessionCommandTimeoutMs +
    2 * refreshRedisOperationBudgetMs +
    DISTRIBUTED_REFRESH_TIMING_MARGIN_MS;
  const sessionSaveOperationCount =
    REDIS_SESSION_MAX_SAVE_ATTEMPTS +
    (REDIS_SESSION_MAX_SAVE_ATTEMPTS - 1) * 2;
  const sessionSaveBudgetMs =
    sessionSaveOperationCount * refreshRedisOperationBudgetMs +
    DISTRIBUTED_REFRESH_TIMING_MARGIN_MS;
  const checkpointPersistenceMs =
    MAX_DISTRIBUTED_SAVE_ATTEMPTS * sessionSaveBudgetMs +
    (MAX_DISTRIBUTED_SAVE_ATTEMPTS - 1) * refreshRedisOperationBudgetMs +
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
  const redisNow = await getRedisServerTimeMs(
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
  );
  const checkpoint = reusableCheckpoint(
    session,
    identityProvider,
    refreshTokenDigest,
    redisNow,
  );
  if (checkpoint) assertCheckpointStillAuthoritative(session, checkpoint);
  return checkpoint;
}

async function saveDistributedRefresh(
  session: IronSession<SunriseSession>,
  lockKey: string,
  owner: string,
  lockTimeoutMs: number,
  consumedTokenDigest: string,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_DISTRIBUTED_SAVE_ATTEMPTS; attempt += 1) {
    try {
      await saveRedisSession(session, {
        beforeConflictRetry: async () => {
          if (!(await renewDistributedLock(lockKey, owner, lockTimeoutMs))) {
            throw new Error(
              "Lost the distributed OIDC refresh lease during a session conflict",
            );
          }
        },
        maximumCommandTimeoutMs: DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
        validateConflictRetry: (authoritative) =>
          assertRefreshConflictIsSafe(
            authoritative,
            consumedTokenDigest,
            session.oidcRefreshCheckpoint,
          ),
      });
      return;
    } catch (error) {
      if (error instanceof SupersededOidcRefreshError) throw error;
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
  for (
    let generation = 0;
    generation < MAX_DISTRIBUTED_REFRESH_GENERATIONS;
    generation += 1
  ) {
    const existing = await reloadCheckpoint(
      session,
      identityProvider,
      refreshTokenDigest,
    );
    if (existing) return existing.result;

    const initialRestart = changedAuthoritativeRefreshToken(
      session,
      refreshTokenDigest,
    );
    if (initialRestart) {
      ({ refreshToken, refreshTokenDigest } = initialRestart);
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
    let restart:
      | { refreshToken: string; refreshTokenDigest: string }
      | undefined;

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
          restart = changedAuthoritativeRefreshToken(
            session,
            refreshTokenDigest,
          );
          if (restart) break;
          assertRefreshStillAuthoritative(session, refreshTokenDigest);
          if (!(await renewDistributedLock(lockKey, owner, lockTimeoutMs))) {
            throw new Error(
              "Lost the distributed OIDC refresh lease before token exchange",
            );
          }

          // Shared checkpoint deadlines must use the same clock on every
          // replica. Sample Redis before the exchange so a TIME failure cannot
          // strand an already-consumed rotating refresh token. This is
          // intentionally conservative by the duration of the OIDC request.
          const refreshStartedAtRedisMs = await getRedisServerTimeMs(
            DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
          );

          const exchanged = await refreshAccessToken(
            refreshToken,
            identityProvider,
          );

          // An interactive continuation is allowed to replace the refresh token
          // without taking this lease. Re-read authority after the exchange so
          // the stale result is never used for a downstream Keystone or RGW
          // renewal. The CAS validator below closes the remaining interval
          // between this read and checkpoint persistence.
          try {
            await reloadRedisSession(session);
          } catch (error) {
            console.warn(
              "[oidc/refresh] could not reload the session after token rotation; preserving through CAS:",
              error,
            );
          }
          assertRefreshStillAuthoritative(session, refreshTokenDigest);
          applyRotatedRefreshToken(session, exchanged);
          session.oidcRefreshCheckpoint = {
            consumedTokenDigest: refreshTokenDigest,
            identityProvider,
            issuedTokenDigest: tokenDigest(
              exchanged.refresh_token ?? refreshToken,
            ),
            result: exchanged,
            // Keep the checkpoint reusable for the full bounded publication
            // window plus the normal reuse period after publication.
            reuseUntil: checkpointReuseUntil(
              exchanged,
              checkpointPersistenceMs,
              refreshStartedAtRedisMs,
            ),
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
          await saveDistributedRefresh(
            session,
            lockKey,
            owner,
            lockTimeoutMs,
            refreshTokenDigest,
          );
          // A continuation can commit immediately after this checkpoint. Read
          // authority once more before returning or choosing the next token so
          // the downstream request never proceeds under superseded identity.
          await reloadRedisSession(session);
          const redisNow = await getRedisServerTimeMs(
            DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
          );
          const persistedCheckpoint = reusableCheckpointForResult(
            session,
            identityProvider,
            exchanged,
            redisNow,
          );
          if (persistedCheckpoint) {
            assertCheckpointStillAuthoritative(session, persistedCheckpoint);
            return exchanged;
          }

          // The rotated refresh token remains authoritative even when slow
          // persistence consumes the useful lifetime of its access token.
          // Release this generation's lease and exchange that token again.
          restart = authoritativeRefreshToken(session);
          break;
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
      restart = changedAuthoritativeRefreshToken(
        session,
        refreshTokenDigest,
      );
      if (restart) break;
      delayMs = Math.min(delayMs * 2, 250);
    }

    if (!restart) {
      throw new Error("Timed out waiting for the distributed OIDC refresh result");
    }
    ({ refreshToken, refreshTokenDigest } = restart);
    key = refreshKey(session, identityProvider, refreshTokenDigest);
  }

  throw new Error("OIDC refresh exceeded the distributed token rotation limit");
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
  const matchesRefreshTokenGeneration =
    existing &&
    (existing.consumedTokenDigest === refreshTokenDigest ||
      existing.issuedTokenDigest === refreshTokenDigest);
  const canReuseExisting =
    existing &&
    matchesRefreshTokenGeneration &&
    (existing.reuseUntil === undefined || existing.reuseUntil > now);

  if (canReuseExisting) {
    const result = await existing.promise;
    if (sessionBackend === "redis") {
      await reloadRedisSession(session);
      const redisNow = await getRedisServerTimeMs(
        DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
      );
      const checkpoint = reusableCheckpointForResult(
        session,
        identityProvider,
        result,
        redisNow,
      );
      if (checkpoint) {
        try {
          assertCheckpointStillAuthoritative(session, checkpoint);
          return checkpoint.result;
        } catch (error) {
          if (refreshEntries.get(key) === existing) refreshEntries.delete(key);
          throw error;
        }
      }

      // The local reuse window is only an optimization. Redis remains the
      // authority, so an expired or replaced checkpoint must fall through to
      // another distributed refresh instead of surfacing as a continuation
      // error. Re-entering reads the authoritative (possibly rotated) token
      // that reloadRedisSession just installed on this session.
      if (refreshEntries.get(key) === existing) refreshEntries.delete(key);
      return refreshSessionOidcTokens(session, identityProvider);
    }
    if (applyRotatedRefreshToken(session, result)) {
      await session.save();
    }
    return result;
  }

  if (
    sessionBackend === "cookie" &&
    !existing &&
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
  const entry: RefreshEntry = {
    consumedTokenDigest: refreshTokenDigest,
    promise: refreshPromise,
  };
  entry.promise = refreshPromise
    .then(async (result) => {
      entry.issuedTokenDigest = tokenDigest(
        result.refresh_token ?? refreshToken,
      );
      if (sessionBackend === "redis") {
        try {
          const observedAt = Date.now();
          const redisNow = await getRedisServerTimeMs(
            DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
          );
          const checkpoint = reusableCheckpointForResult(
            session,
            identityProvider,
            result,
            redisNow,
          );
          const remainingMs = checkpoint
            ? Math.max(0, checkpoint.reuseUntil - redisNow)
            : 0;
          entry.reuseUntil =
            observedAt + Math.min(REFRESH_RESULT_REUSE_MS, remainingMs);
        } catch (error) {
          // The distributed result was already validated before returning.
          // Skip completed local reuse if the shared clock cannot be sampled;
          // a later request can recover through the normal Redis path.
          entry.reuseUntil = Date.now();
          console.warn(
            "[oidc/refresh] could not derive local reuse from Redis time:",
            error,
          );
        }
      } else {
        entry.reuseUntil = checkpointReuseUntil(result, 0);
      }
      return result;
    })
    .catch((error) => {
      if (refreshEntries.get(key) === entry) refreshEntries.delete(key);
      throw error;
    });
  if (refreshEntries.size < MAX_REFRESH_ENTRIES || refreshEntries.has(key)) {
    refreshEntries.set(key, entry);
  }

  const result = await entry.promise;
  if (applyRotatedRefreshToken(session, result)) {
    await session.save();
  }
  return result;
}
