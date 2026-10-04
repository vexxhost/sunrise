import "server-only";

import type { IronSession } from "iron-session";
import { refreshSessionOidcTokens } from "@/lib/oidc/session-refresh";
import { getSunriseOidcConfig } from "@/lib/oidc/sunrise";
import {
  getActiveS3Credentials,
  normalizeProjectId,
  setS3CredentialsForProject,
  type S3StsCredentials,
  type SunriseSession,
} from "@/lib/session";
import { getSessionLifetimeState } from "@/lib/session-lifetime";
import { assumeRoleWithIdToken, tryExtractRgwProjectRoles } from "@/lib/s3/sts";

export class S3ProjectRoleUnavailableError extends Error {
  constructor(projectId: string) {
    super(`No Object Storage role is mapped to project ${projectId}`);
    this.name = "S3ProjectRoleUnavailableError";
  }
}

type RefreshedRgwIdentity = {
  roleTokens: Array<string | undefined>;
  sessionChanged: boolean;
  token: string;
};

async function refreshRgwIdentity(
  session: IronSession<SunriseSession>,
  identityProvider: string,
  projectId: string,
): Promise<RefreshedRgwIdentity | undefined> {
  if (!session.keycloakRefreshToken) return undefined;

  try {
    const previousRefreshToken = session.keycloakRefreshToken;
    const refreshed = await refreshSessionOidcTokens(session, identityProvider);
    if (!refreshed) return undefined;

    return {
      token: refreshed.access_token,
      roleTokens: [refreshed.access_token, refreshed.id_token],
      sessionChanged: session.keycloakRefreshToken !== previousRefreshToken,
    };
  } catch (error) {
    console.warn("[s3/session] failed to renew RGW access from Sunrise OIDC", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function refreshActiveProjectS3Credentials(
  session: IronSession<SunriseSession>,
): Promise<S3StsCredentials | undefined> {
  if (getSessionLifetimeState(session).status !== "active") return undefined;

  const projectId = normalizeProjectId(session.projectId);
  if (!projectId) return undefined;
  const identityProvider =
    session.federationIdentityProvider ??
    session.oidcIdentity?.identityProvider;
  if (!identityProvider) return undefined;

  const refreshed = await refreshRgwIdentity(
    session,
    identityProvider,
    projectId,
  );
  if (!refreshed) return undefined;
  let { sessionChanged } = refreshed;

  const projectRoles = tryExtractRgwProjectRoles(...refreshed.roleTokens);
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

  const { rgwStsDurationSeconds } = getSunriseOidcConfig(identityProvider);
  const creds = await assumeRoleWithIdToken(
    refreshed.token,
    projectId,
    roleArn,
    undefined,
    rgwStsDurationSeconds,
  );
  setS3CredentialsForProject(session, creds);
  await session.save();
  return creds;
}

export async function ensureActiveProjectS3Credentials(
  session: IronSession<SunriseSession>,
): Promise<S3StsCredentials | undefined> {
  if (getSessionLifetimeState(session).status !== "active") return undefined;

  const current = getActiveS3Credentials(session);
  if (current) return current;

  return refreshActiveProjectS3Credentials(session);
}
