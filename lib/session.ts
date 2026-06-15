import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export type S3StsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number; // epoch ms
  projectId: string;
};

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystoneProjectToken?: string;
  regionId?: string;
  projectId?: string;
  s3ProjectRoles?: Record<string, string>;
  s3Credentials?: S3StsCredentials;
  s3OidcVerifier?: string;
  s3OidcState?: string;
  // Unified Sunrise OIDC flow (Keycloak as IdP for both Keystone + S3 STS).
  oidcVerifier?: string;
  oidcState?: string;
  oidcIdProvider?: string;
  keycloakRefreshToken?: string;
};

export function normalizeProjectId(projectId?: string | null): string {
  return projectId?.replace(/-/g, '').toLowerCase() ?? '';
}

export function isS3StsCredentialFresh(
  creds?: S3StsCredentials,
  bufferMs = 60_000
): creds is S3StsCredentials {
  return Boolean(creds && creds.expiration - Date.now() >= bufferMs);
}

export function getS3CredentialsForProject(
  session: SunriseSession,
  projectId?: string | null
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
  session: SunriseSession
): S3StsCredentials | undefined {
  return getS3CredentialsForProject(session, session.projectId);
}

export function setS3CredentialsForProject(
  session: SunriseSession,
  creds: S3StsCredentials
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

// Setup the config for your session and cookie
export async function getSession(): Promise<IronSession<SunriseSession>> {
  return await getIronSession<SunriseSession>(await cookies(), { cookieName: "sunrise", password: process.env.SESSION_SECRET as string });
}
