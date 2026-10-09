import "server-only";

import { createHash } from "node:crypto";
import type { IronSession } from "iron-session";
import type { SunriseSession } from "@/lib/session";
import { saveRedisSession } from "@/lib/session-store";

export type OidcSessionAuthority = {
  generation?: string;
  identityProvider?: string;
  refreshTokenDigest?: string;
};

function tokenDigest(token?: string) {
  return token
    ? createHash("sha256").update(token).digest("base64url")
    : undefined;
}

export function captureOidcSessionAuthority(
  session: Readonly<SunriseSession>,
): OidcSessionAuthority {
  return {
    generation: session.oidcSessionGeneration,
    identityProvider:
      session.federationIdentityProvider ??
      session.oidcIdentity?.identityProvider,
    refreshTokenDigest: tokenDigest(session.keycloakRefreshToken),
  };
}

export function assertOidcSessionAuthority(
  session: Readonly<SunriseSession>,
  expected: Readonly<OidcSessionAuthority>,
) {
  const current = captureOidcSessionAuthority(session);
  if (
    session.oidcSessionContinuation ||
    current.generation !== expected.generation ||
    current.identityProvider !== expected.identityProvider ||
    current.refreshTokenDigest !== expected.refreshTokenDigest
  ) {
    throw new Error(
      "Credential renewal was superseded by a newer OIDC session",
    );
  }
}

export async function saveOidcSessionIfAuthoritative(
  session: IronSession<SunriseSession>,
  expected: Readonly<OidcSessionAuthority>,
) {
  await saveRedisSession(session, {
    validateConflictRetry: (authoritative) =>
      assertOidcSessionAuthority(authoritative, expected),
  });
}
