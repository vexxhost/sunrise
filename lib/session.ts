import { randomUUID } from "node:crypto";
import {
  getIronSession,
  type IronSession,
  type SessionOptions,
} from "iron-session";
import { cookies } from "next/headers";
import {
  destroyRedisSession,
  getRedisSession,
  rotateRedisSession,
} from "@/lib/session-store";
import {
  getSessionLifetimePolicy,
  getSessionLifetimeState,
  type SessionExpiryReason,
} from "@/lib/session-lifetime";
import { getSessionBackend } from "@/lib/redis";
import type { KeystoneRole } from "@/types/openstack";

export const SESSION_COOKIE_NAME = "sunrise";
export const SESSION_ACTIVITY_COOKIE_NAME = "sunrise-activity";

export type S3StsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number; // epoch ms
  projectId: string;
};

export type SunriseIdentity = {
  subject: string;
  displayName: string;
  email?: string;
  preferredUsername?: string;
  issuer: string;
  identityProvider: string;
};

export type AuthRecoveryReason =
  | "access-denied"
  | "federation-failed"
  | "no-projects"
  | "no-role"
  | "session-unavailable";

export type AuthRecoveryIssue = {
  reason: AuthRecoveryReason;
};

export type OidcRefreshResult = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export type OidcRefreshCheckpoint = {
  ancestorTokenDigests?: string[];
  consumedTokenDigest: string;
  identityProvider: string;
  issuedTokenDigest: string;
  result: OidcRefreshResult;
  reuseUntil: number;
};

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystoneProjectToken?: string;
  keystoneProjectRoles?: KeystoneRole[];
  regionId?: string;
  projectId?: string;
  s3ProjectRoles?: Record<string, string>;
  s3Credentials?: S3StsCredentials;
  // Unified Sunrise OIDC flow (Keycloak as IdP for both Keystone + S3 STS).
  oidcVerifier?: string;
  oidcState?: string;
  oidcIdProvider?: string;
  oidcReturnTo?: string;
  oidcIdentity?: SunriseIdentity;
  federationIdentityProvider?: string;
  authRecovery?: AuthRecoveryIssue;
  keycloakRefreshToken?: string;
  oidcRefreshCheckpoint?: OidcRefreshCheckpoint;
  oidcSessionGeneration?: string;
  cloudContextBootstrapId?: string;
  sessionId?: string;
  sessionSignedInAt?: number;
  sessionLastActivityAt?: number;
  sessionExpiryReason?: SessionExpiryReason;
  oidcSessionContinuation?: boolean;
};

type SessionActivity = {
  sessionId?: string;
  lastActivityAt?: number;
};

type GetSessionOptions = {
  allowExpired?: boolean;
};

function sessionOptions(cookieName: string, chunk = false): SessionOptions {
  const { absoluteTimeoutSeconds } = getSessionLifetimePolicy();
  return {
    cookieName,
    password: process.env.SUNRISE_SESSION_SECRET as string,
    // Keep the seal valid for one minute longer than the browser cookie so
    // iron-session never rejects a cookie the browser still considers valid.
    ttl: absoluteTimeoutSeconds + 60,
    chunk,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: absoluteTimeoutSeconds,
    },
  };
}

function setTransient<K extends keyof SunriseSession>(
  session: IronSession<SunriseSession>,
  key: K,
  value: SunriseSession[K],
) {
  Object.defineProperty(session, key, {
    configurable: true,
    enumerable: false,
    writable: true,
    value,
  });
}

export function hasAuthenticatedSession(session: SunriseSession): boolean {
  return Boolean(
    session.oidcIdentity ||
    session.keycloakRefreshToken ||
    session.keystone_unscoped_token ||
    session.keystoneProjectToken ||
    session.s3Credentials,
  );
}

function denyExpiredCredentials(session: IronSession<SunriseSession>) {
  session.keystone_unscoped_token = undefined;
  session.keystoneProjectToken = undefined;
  session.keystoneProjectRoles = undefined;
  session.keycloakRefreshToken = undefined;
  session.oidcRefreshCheckpoint = undefined;
  session.oidcSessionGeneration = undefined;
  session.s3Credentials = undefined;
}

async function activitySession() {
  return getIronSession<SessionActivity>(
    await cookies(),
    sessionOptions(SESSION_ACTIVITY_COOKIE_NAME),
  );
}

export async function startSessionLifetime(
  session: IronSession<SunriseSession>,
  now = Date.now(),
) {
  await rotateRedisSession(session);
  const sessionId = randomUUID();
  session.sessionId = sessionId;
  session.sessionSignedInAt = now;
  session.oidcRefreshCheckpoint = undefined;
  setTransient(session, "sessionLastActivityAt", now);
  setTransient(session, "sessionExpiryReason", undefined);
  await saveSessionActivity(sessionId, now);
}

export async function saveSessionActivity(
  sessionId: string,
  lastActivityAt = Date.now(),
) {
  const activity = await activitySession();
  activity.sessionId = sessionId;
  activity.lastActivityAt = lastActivityAt;
  await activity.save();
}

export async function destroySessionActivity() {
  const activity = await activitySession();
  activity.destroy();
}

export function normalizeProjectId(projectId?: string | null): string {
  return projectId?.replace(/-/g, "").toLowerCase() ?? "";
}

export function isS3StsCredentialFresh(
  creds?: S3StsCredentials,
  bufferMs = 5 * 60_000,
): creds is S3StsCredentials {
  return Boolean(creds && creds.expiration - Date.now() >= bufferMs);
}

export function getS3CredentialsForProject(
  session: SunriseSession,
  projectId?: string | null,
): S3StsCredentials | undefined {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return undefined;

  const creds = session.s3Credentials;
  if (normalizeProjectId(creds?.projectId) !== normalizedProjectId) {
    return undefined;
  }

  return isS3StsCredentialFresh(creds) ? creds : undefined;
}

export function getActiveS3Credentials(
  session: SunriseSession,
): S3StsCredentials | undefined {
  return getS3CredentialsForProject(session, session.projectId);
}

export function setS3CredentialsForProject(
  session: SunriseSession,
  creds: S3StsCredentials,
) {
  const normalizedProjectId = normalizeProjectId(creds.projectId);
  if (!normalizedProjectId) return;

  session.s3Credentials = {
    ...creds,
    projectId: normalizedProjectId,
  };
}

export function clearS3Credentials(session: SunriseSession) {
  session.s3Credentials = undefined;
}

export async function getSession(
  options: GetSessionOptions = {},
): Promise<IronSession<SunriseSession>> {
  const cookieStore = await cookies();
  const backend = getSessionBackend();
  const sessionOptionsValue = sessionOptions(SESSION_COOKIE_NAME, true);
  const session =
    backend === "redis"
      ? await getRedisSession(cookieStore, sessionOptionsValue)
      : await getIronSession<SunriseSession>(cookieStore, sessionOptionsValue);

  if (session.sessionId) {
    const activity = await getIronSession<SessionActivity>(
      cookieStore,
      sessionOptions(SESSION_ACTIVITY_COOKIE_NAME),
    );
    const lastActivityAt =
      activity.sessionId === session.sessionId
        ? activity.lastActivityAt
        : undefined;
    setTransient(session, "sessionLastActivityAt", lastActivityAt);
  }

  if (!hasAuthenticatedSession(session)) return session;

  const lifetime = getSessionLifetimeState(session);
  if (lifetime.status === "active") {
    setTransient(session, "sessionExpiryReason", undefined);
    return session;
  }

  setTransient(session, "sessionExpiryReason", lifetime.reason);
  if (!options.allowExpired) denyExpiredCredentials(session);
  return session;
}

export async function destroySession(session: IronSession<SunriseSession>) {
  if (getSessionBackend() === "redis") {
    await destroyRedisSession(session);
    return;
  }
  session.destroy();
}
