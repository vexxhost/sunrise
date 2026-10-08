import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { IronSession } from "iron-session";
import {
  refreshAccessToken,
  type RefreshTokenResult,
} from "@/lib/oidc/sunrise";
import type { SunriseSession } from "@/lib/session";
import {
  getSessionBackend,
  getRedisKeyPrefix,
  runRedisCommand,
} from "@/lib/redis";

const REFRESH_RESULT_REUSE_MS = 30_000;
const MAX_REFRESH_ENTRIES = 256;
const DISTRIBUTED_REFRESH_LOCK_MS = 20_000;
const DISTRIBUTED_REFRESH_WAIT_MS = 15_000;

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

function distributedRefreshKeys(key: string) {
  const digest = createHash("sha256").update(key).digest("base64url");
  const prefix = getRedisKeyPrefix();
  return {
    lock: `${prefix}:oidc-refresh-lock:${digest}`,
    result: `${prefix}:oidc-refresh-result:${digest}`,
  };
}

function distributedRefreshMetricsKey() {
  return `${getRedisKeyPrefix()}:oidc-refresh-metrics`;
}

async function recordDistributedRefresh(metric: string) {
  await runRedisCommand((client) =>
    client.hIncrBy(distributedRefreshMetricsKey(), metric, 1),
  ).catch(() => undefined);
}

function parseRefreshResult(value: string | null) {
  if (!value) return undefined;
  return JSON.parse(value) as RefreshTokenResult;
}

async function releaseDistributedLock(key: string, owner: string) {
  await runRedisCommand((client) =>
    client.eval(RELEASE_LOCK_SCRIPT, {
      keys: [key],
      arguments: [owner],
    }),
  );
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
  const cached = parseRefreshResult(
    await runRedisCommand((client) => client.get(keys.result)),
  );
  if (cached) {
    await recordDistributedRefresh("result_reuse");
    return cached;
  }

  const deadline = Date.now() + DISTRIBUTED_REFRESH_WAIT_MS;
  const owner = randomUUID();
  let delayMs = 40;

  while (Date.now() < deadline) {
    const acquired = await runRedisCommand((client) =>
      client.set(keys.lock, owner, {
        expiration: { type: "PX", value: DISTRIBUTED_REFRESH_LOCK_MS },
        condition: "NX",
      }),
    );
    if (acquired === "OK") {
      await recordDistributedRefresh("leaders");
      try {
        const result = await refreshAccessToken(refreshToken, identityProvider);
        await runRedisCommand((client) =>
          client.set(keys.result, JSON.stringify(result), {
            expiration: { type: "PX", value: REFRESH_RESULT_REUSE_MS },
          }),
        );
        return result;
      } finally {
        await releaseDistributedLock(keys.lock, owner).catch((error) => {
          console.warn("[oidc/refresh] failed to release Redis lock:", error);
        });
      }
    }

    await wait(delayMs);
    const result = parseRefreshResult(
      await runRedisCommand((client) => client.get(keys.result)),
    );
    if (result) {
      await recordDistributedRefresh("followers");
      return result;
    }
    delayMs = Math.min(delayMs * 2, 250);
  }

  await recordDistributedRefresh("timeouts");
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
