import type { SunriseIdentity, SunriseSession } from "@/lib/session";

export type PreferenceIdentity = Pick<SunriseIdentity, "issuer" | "subject">;

export function preferenceIdentityFromSession(
  session: Pick<SunriseSession, "oidcIdentity">,
): PreferenceIdentity | undefined {
  const identity = session.oidcIdentity;
  if (!identity?.issuer || !identity.subject) return undefined;
  return { issuer: identity.issuer, subject: identity.subject };
}
