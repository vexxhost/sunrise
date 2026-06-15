import 'server-only';

import type { IronSession } from 'iron-session';
import {
  getActiveS3Credentials,
  normalizeProjectId,
  setS3CredentialsForProject,
  type S3StsCredentials,
  type SunriseSession,
} from '@/lib/session';
import {
  refreshAccessToken,
  tokenExchangeForRgw,
} from '@/lib/oidc/sunrise';
import {
  assumeRoleWithIdToken,
  tryExtractRgwProjectRoles,
} from '@/lib/s3/sts';

export async function refreshActiveProjectS3Credentials(
  session: IronSession<SunriseSession>
): Promise<S3StsCredentials | undefined> {
  const projectId = normalizeProjectId(session.projectId);
  if (!projectId) return undefined;
  if (!session.keycloakRefreshToken) return undefined;

  const refreshed = await refreshAccessToken(session.keycloakRefreshToken);
  let sessionChanged = false;

  if (refreshed.refresh_token) {
    session.keycloakRefreshToken = refreshed.refresh_token;
    sessionChanged = true;
  }

  const exchanged = await tokenExchangeForRgw(refreshed.access_token);
  const rgwToken = exchanged.id_token ?? exchanged.access_token;
  const projectRoles = tryExtractRgwProjectRoles(
    rgwToken,
    exchanged.id_token,
    exchanged.access_token,
    refreshed.id_token,
    refreshed.access_token
  );
  if (projectRoles) {
    session.s3ProjectRoles = {
      ...session.s3ProjectRoles,
      ...projectRoles,
    };
    sessionChanged = true;
  }

  const roleArn = session.s3ProjectRoles?.[projectId];
  if (!roleArn) {
    if (sessionChanged) {
      await session.save();
    }
    return undefined;
  }

  const creds = await assumeRoleWithIdToken(rgwToken, projectId, roleArn);
  setS3CredentialsForProject(session, creds);
  await session.save();
  return creds;
}

export async function ensureActiveProjectS3Credentials(
  session: IronSession<SunriseSession>
): Promise<S3StsCredentials | undefined> {
  const current = getActiveS3Credentials(session);
  if (current) return current;

  return refreshActiveProjectS3Credentials(session);
}
