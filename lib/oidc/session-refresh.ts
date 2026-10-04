import "server-only";

import { createHash } from "node:crypto";
import type { IronSession } from "iron-session";
import {
  refreshAccessToken,
  type RefreshTokenResult,
} from "@/lib/oidc/sunrise";
import type { SunriseSession } from "@/lib/session";

const REFRESH_RESULT_REUSE_MS = 30_000;
const MAX_REFRESH_ENTRIES = 256;

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

  const refreshPromise = refreshAccessToken(refreshToken, identityProvider);
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
