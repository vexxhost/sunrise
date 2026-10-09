import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { sealData, unsealData, type IronSession } from "iron-session";
import {
  OIDC_REFRESH_TIMEOUT_MS,
  refreshAccessToken,
  type RefreshTokenResult,
} from "@/lib/oidc/sunrise";
import type { SunriseSession } from "@/lib/session";
import {
  getSessionBackend,
  getRedisKeyPrefix,
  runIsolatedRedisCommand,
  runRedisCommand,
} from "@/lib/redis";

const REFRESH_RESULT_REUSE_MS = 30_000;
const REFRESH_RESULT_REUSE_SECONDS = Math.ceil(REFRESH_RESULT_REUSE_MS / 1_000);
const MAX_REFRESH_ENTRIES = 256;
const DISTRIBUTED_REFRESH_LOCK_MS = 20_000;
const DISTRIBUTED_REFRESH_RENEW_MS = 5_000;
const MAX_DISTRIBUTED_REFRESH_LEADERS = 3;
// Coordination must fail well before the current lease can expire, even when
// the general Redis command budget is configured at its 30-second maximum.
const DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS = 2_000;
const DISTRIBUTED_REFRESH_WAIT_MS = OIDC_REFRESH_TIMEOUT_MS + 5_000;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const ACQUIRE_LOCK_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 2
end
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

const PUBLISH_REFRESH_RESULT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])
  return 1
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

function distributedRefreshKeys(key: string) {
  const digest = createHash("sha256").update(key).digest("base64url");
  const prefix = getRedisKeyPrefix();
  return {
    lock: `${prefix}:oidc-refresh-lock:${digest}`,
    result: `${prefix}:oidc-refresh-result:${digest}`,
  };
}

function sessionPassword() {
  const value = process.env.SUNRISE_SESSION_SECRET;
  if (!value) throw new Error("SUNRISE_SESSION_SECRET is required");
  return value;
}

function isRefreshResult(value: unknown): value is RefreshTokenResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<RefreshTokenResult>;
  return (
    typeof result.access_token === "string" &&
    typeof result.expires_in === "number" &&
    typeof result.token_type === "string"
  );
}

export async function sealDistributedRefreshResult(result: RefreshTokenResult) {
  return sealData(result, {
    password: sessionPassword(),
    ttl: REFRESH_RESULT_REUSE_SECONDS,
  });
}

export async function unsealDistributedRefreshResult(value: string | null) {
  if (!value) return undefined;
  const result = await unsealData<RefreshTokenResult>(value, {
    password: sessionPassword(),
    ttl: REFRESH_RESULT_REUSE_SECONDS,
  });
  return isRefreshResult(result) ? result : undefined;
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

async function renewDistributedLock(key: string, owner: string) {
  const renewed = await runIsolatedRedisCommand(
    (client) =>
      client.eval(RENEW_LOCK_SCRIPT, {
        keys: [key],
        arguments: [owner, DISTRIBUTED_REFRESH_LOCK_MS.toString()],
      }),
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
  );
  return Number(renewed) === 1;
}

function maintainDistributedLock(key: string, owner: string) {
  let lost = false;
  let renewal: Promise<void> | undefined;
  const controller = new AbortController();

  const loseLease = (reason: Error) => {
    if (lost) return;
    lost = true;
    controller.abort(reason);
  };

  const timer = setInterval(() => {
    if (renewal || lost) return;
    renewal = renewDistributedLock(key, owner)
      .then((renewed) => {
        if (!renewed) {
          loseLease(new Error("Lost the distributed OIDC refresh lease"));
        }
      })
      .catch((error) => {
        console.warn("[oidc/refresh] failed to renew Redis lock:", error);
        loseLease(
          new Error("Could not renew the distributed OIDC refresh lease", {
            cause: error,
          }),
        );
      })
      .finally(() => {
        renewal = undefined;
      });
  }, DISTRIBUTED_REFRESH_RENEW_MS);
  timer.unref();

  return {
    signal: controller.signal,
    isLost: () => lost,
    async stop() {
      clearInterval(timer);
      await renewal;
    },
  };
}

async function publishDistributedRefreshResult(
  lockKey: string,
  resultKey: string,
  owner: string,
  result: RefreshTokenResult,
) {
  const sealed = await sealDistributedRefreshResult(result);
  const published = await runRedisCommand(
    (client) =>
      client.eval(PUBLISH_REFRESH_RESULT_SCRIPT, {
        keys: [lockKey, resultKey],
        arguments: [owner, sealed, REFRESH_RESULT_REUSE_MS.toString()],
      }),
    DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
  );
  return Number(published) === 1;
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function distributedRefresh(
  key: string,
  refreshToken: string,
  identityProvider: string,
) {
  const keys = distributedRefreshKeys(key);
  const cached = await unsealDistributedRefreshResult(
    await runRedisCommand((client) => client.get(keys.result)),
  );
  if (cached) {
    return cached;
  }

  const startedAt = Date.now();
  const maximumDeadline =
    startedAt + DISTRIBUTED_REFRESH_WAIT_MS * MAX_DISTRIBUTED_REFRESH_LEADERS;
  let followerDeadline = startedAt + DISTRIBUTED_REFRESH_WAIT_MS;
  const observedLeaders = new Set<string>();
  const owner = randomUUID();
  let delayMs = 40;

  while (Date.now() < followerDeadline) {
    const acquisitionResult = await runRedisCommand(
      (client) =>
        client.eval(ACQUIRE_LOCK_SCRIPT, {
          keys: [keys.lock, keys.result],
          arguments: [owner, DISTRIBUTED_REFRESH_LOCK_MS.toString()],
        }),
      DISTRIBUTED_REFRESH_REDIS_TIMEOUT_MS,
    );
    const acquisition = Number(acquisitionResult);
    if (acquisition === 2) {
      const result = await unsealDistributedRefreshResult(
        await runRedisCommand((client) => client.get(keys.result)),
      );
      if (result) {
        return result;
      }
      await runRedisCommand((client) => client.del(keys.result));
      continue;
    }
    if (acquisition === 1) {
      const lease = maintainDistributedLock(keys.lock, owner);
      try {
        const result = await refreshAccessToken(
          refreshToken,
          identityProvider,
          lease.signal,
        );
        if (lease.isLost()) {
          throw new Error("Lost the distributed OIDC refresh lease");
        }
        const published = await publishDistributedRefreshResult(
          keys.lock,
          keys.result,
          owner,
          result,
        );
        if (!published) {
          throw new Error("Lost the distributed OIDC refresh lease");
        }
        return result;
      } finally {
        await lease.stop();
        void releaseDistributedLock(keys.lock, owner).catch((error) => {
          console.warn("[oidc/refresh] failed to release Redis lock:", error);
        });
      }
    }

    if (
      typeof acquisitionResult === "string" &&
      !observedLeaders.has(acquisitionResult) &&
      observedLeaders.size < MAX_DISTRIBUTED_REFRESH_LEADERS
    ) {
      observedLeaders.add(acquisitionResult);
      followerDeadline = Math.min(
        maximumDeadline,
        Math.max(followerDeadline, Date.now() + DISTRIBUTED_REFRESH_WAIT_MS),
      );
    }

    await wait(delayMs);
    const result = await unsealDistributedRefreshResult(
      await runRedisCommand((client) => client.get(keys.result)),
    );
    if (result) {
      return result;
    }
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

function applyRotatedRefreshToken(
  session: IronSession<SunriseSession>,
  result: RefreshTokenResult,
) {
  if (result.refresh_token) {
    session.keycloakRefreshToken = result.refresh_token;
  }
}

/**
 * Coalesces OIDC refresh-token rotation for requests carrying the same
 * encrypted Sunrise session. A completed result remains reusable briefly so
 * a request that started with the previous cookie cannot replay an already
 * rotated Keycloak refresh token.
 */
export async function refreshSessionOidcTokens(
  session: IronSession<SunriseSession>,
  identityProvider: string,
): Promise<RefreshTokenResult | undefined> {
  const refreshToken = session.keycloakRefreshToken;
  if (!refreshToken) return undefined;

  const now = Date.now();
  pruneRefreshEntries(now);

  const inputTokenDigest = tokenDigest(refreshToken);
  const key = refreshKey(session, identityProvider, inputTokenDigest);
  const existing = refreshEntries.get(key);
  const canReuseExisting =
    existing &&
    (existing.reuseUntil === undefined || existing.reuseUntil > now);

  if (canReuseExisting) {
    const result = await existing.promise;
    applyRotatedRefreshToken(session, result);
    return result;
  }

  const refreshPromise =
    getSessionBackend() === "redis"
      ? distributedRefresh(key, refreshToken, identityProvider)
      : refreshAccessToken(refreshToken, identityProvider);
  const entry: RefreshEntry = {
    promise: refreshPromise,
  };
  entry.promise = refreshPromise
    .then((result) => {
      entry.reuseUntil = Date.now() + REFRESH_RESULT_REUSE_MS;
      return result;
    })
    .catch((error) => {
      if (refreshEntries.get(key) === entry) refreshEntries.delete(key);
      throw error;
    });
  refreshEntries.set(key, entry);

  const result = await entry.promise;
  applyRotatedRefreshToken(session, result);
  return result;
}
