import type { SunriseSession } from "@/lib/session";

export function hasAuthenticatedSessionData(
  session: SunriseSession,
): boolean {
  return Boolean(
    session.oidcIdentity ||
      session.keycloakRefreshToken ||
      session.oidcRefreshCheckpoint ||
      session.keystone_unscoped_token ||
      session.keystoneProjectToken ||
      session.s3Credentials,
  );
}
