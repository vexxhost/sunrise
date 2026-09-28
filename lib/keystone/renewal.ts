import "server-only";

import type { IronSession } from "iron-session";
import {
  federateOidcWithKeystone,
  finalizeKeystoneSession,
} from "@/lib/keystone/login";
import { refreshAccessToken } from "@/lib/oidc/sunrise";
import type { SunriseSession } from "@/lib/session";
import { getSessionLifetimeState } from "@/lib/session-lifetime";

const PROTOCOL =
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL ?? "openid";

export type KeystoneRenewalResult =
  "ready" | "no-projects" | "no-role" | "reauthenticate" | "expired";

export async function refreshKeystoneSession(
  session: IronSession<SunriseSession>,
): Promise<KeystoneRenewalResult> {
  if (getSessionLifetimeState(session).status !== "active") return "expired";

  const refreshToken = session.keycloakRefreshToken;
  const identityProvider = session.oidcIdentity?.identityProvider;
  if (!refreshToken || !identityProvider) return "reauthenticate";

  let refreshed;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (error) {
    console.warn("[keystone/session] failed to refresh Keycloak token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "reauthenticate";
  }

  if (refreshed.refresh_token) {
    session.keycloakRefreshToken = refreshed.refresh_token;
  }

  const unscopedToken = await federateOidcWithKeystone(
    refreshed.access_token,
    identityProvider,
    PROTOCOL,
  );
  const resolution = await finalizeKeystoneSession(session, unscopedToken);

  session.authRecovery =
    resolution.status === "ready" ? undefined : { reason: resolution.status };
  await session.save();
  return resolution.status;
}
