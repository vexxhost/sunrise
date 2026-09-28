import "server-only";

import type { IronSession } from "iron-session";
import {
  getActiveS3Credentials,
  normalizeProjectId,
  setS3CredentialsForProject,
  type S3StsCredentials,
  type SunriseSession,
} from "@/lib/session";
import { refreshS3Tokens, type S3OidcRefreshResult } from "@/lib/s3/oidc";
import { assumeRoleWithIdToken, tryExtractRgwProjectRoles } from "@/lib/s3/sts";

export class S3ProjectRoleUnavailableError extends Error {
  constructor(projectId: string) {
    super(`No Object Storage role is mapped to project ${projectId}`);
    this.name = "S3ProjectRoleUnavailableError";
  }
}

export async function refreshActiveProjectS3Credentials(
  session: IronSession<SunriseSession>,
): Promise<S3StsCredentials | undefined> {
  const projectId = normalizeProjectId(session.projectId);
  if (!projectId) return undefined;
  if (!session.s3OidcRefreshToken) return undefined;

  let refreshed: S3OidcRefreshResult;
  try {
    refreshed = await refreshS3Tokens(session.s3OidcRefreshToken);
    if (!refreshed.id_token) {
      throw new Error("S3 OIDC refresh did not return an ID token");
    }
  } catch (error) {
    console.warn("[s3/session] failed to refresh Object Storage OIDC token", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
  let sessionChanged = false;

  if (refreshed.refresh_token) {
    session.s3OidcRefreshToken = refreshed.refresh_token;
    sessionChanged = true;
  }

  const projectRoles = tryExtractRgwProjectRoles(
    refreshed.id_token,
    refreshed.access_token,
  );
  if (projectRoles) {
    // Treat each freshly issued claim as authoritative so revoked project
    // roles cannot survive indefinitely in the encrypted session cookie.
    session.s3ProjectRoles = projectRoles;
    sessionChanged = true;
  }

  // Keycloak refresh-token rotation may invalidate the previous token as soon
  // as this response is issued. Persist the replacement token and the latest
  // role mapping before STS discovery or role assumption can fail.
  if (sessionChanged) {
    await session.save();
  }

  const roleArn = session.s3ProjectRoles?.[projectId];
  if (!roleArn) {
    throw new S3ProjectRoleUnavailableError(projectId);
  }

  const creds = await assumeRoleWithIdToken(
    refreshed.id_token,
    projectId,
    roleArn,
  );
  setS3CredentialsForProject(session, creds);
  await session.save();
  return creds;
}

export async function ensureActiveProjectS3Credentials(
  session: IronSession<SunriseSession>,
): Promise<S3StsCredentials | undefined> {
  const current = getActiveS3Credentials(session);
  if (current) return current;

  return refreshActiveProjectS3Credentials(session);
}
