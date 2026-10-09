import "server-only";

import type { IronSession } from "iron-session";
import {
  federateOidcWithKeystone,
  finalizeKeystoneSession,
} from "@/lib/keystone/login";
import { refreshSessionOidcTokens } from "@/lib/oidc/session-refresh";
import { getSunriseOidcConfig } from "@/lib/oidc/sunrise";
import type { SunriseSession } from "@/lib/session";
import { getSessionLifetimeState } from "@/lib/session-lifetime";

export type KeystoneRenewalResult =
  "ready" | "no-projects" | "no-role" | "reauthenticate" | "expired";

export async function refreshKeystoneSession(
  session: IronSession<SunriseSession>,
): Promise<KeystoneRenewalResult> {
  if (getSessionLifetimeState(session).status !== "active") return "expired";

  const refreshToken = session.keycloakRefreshToken;
  const identityProvider =
    session.federationIdentityProvider ??
    session.oidcIdentity?.identityProvider;
  if (!refreshToken || !identityProvider) return "reauthenticate";

  let refreshed;
  let protocol: string;
  try {
    protocol = getSunriseOidcConfig(identityProvider).protocol;
    refreshed = await refreshSessionOidcTokens(session, identityProvider);
  } catch (error) {
    console.warn("[keystone/session] failed to refresh Keycloak token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "reauthenticate";
  }

  if (!refreshed) return "reauthenticate";

  // Keycloak may rotate refresh tokens as single-use credentials. Persist the
  // replacement before slower downstream work so another replica never falls
  // back to the consumed token if Keystone fails or stalls.
  if (session.keycloakRefreshToken !== refreshToken) {
    await session.save();
  }

  const unscopedToken = await federateOidcWithKeystone(
    refreshed.access_token,
    identityProvider,
    protocol,
  );
  const resolution = await finalizeKeystoneSession(session, unscopedToken);

  session.authRecovery =
    resolution.status === "ready" ? undefined : { reason: resolution.status };
  await session.save();
  return resolution.status;
}
