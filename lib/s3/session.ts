import "server-only";

import type { IronSession } from "iron-session";
import { refreshSessionOidcTokens } from "@/lib/oidc/session-refresh";
import {
  captureOidcSessionAuthority,
  isOidcSessionSupersededError,
  OidcSessionSupersededError,
  saveOidcSessionIfAuthoritative,
} from "@/lib/oidc/session-authority";
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
  token: string;
};

function sameProjectRoles(
  current: Record<string, string> | undefined,
  next: Record<string, string>,
) {
  if (!current) return false;
  const entries = Object.entries(next);
  return (
    Object.keys(current).length === entries.length &&
    entries.every(([projectId, role]) => current[projectId] === role)
  );
}

async function refreshRgwIdentity(
  session: IronSession<SunriseSession>,
  identityProvider: string,
  projectId: string,
): Promise<RefreshedRgwIdentity | undefined> {
  if (!session.keycloakRefreshToken) return undefined;

  try {
    const refreshed = await refreshSessionOidcTokens(session, identityProvider);
    if (!refreshed) return undefined;

    return {
      token: refreshed.access_token,
      roleTokens: [refreshed.access_token, refreshed.id_token],
    };
  } catch (error) {
    if (isOidcSessionSupersededError(error)) throw error;
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
  if (normalizeProjectId(session.projectId) !== projectId) {
    throw new OidcSessionSupersededError();
  }
  const authority = captureOidcSessionAuthority(session);
  let sessionChanged = false;

  const projectRoles = tryExtractRgwProjectRoles(...refreshed.roleTokens);
  if (projectRoles && !sameProjectRoles(session.s3ProjectRoles, projectRoles)) {
    // Treat each freshly issued claim as authoritative so revoked project
    // roles cannot survive indefinitely in the encrypted session cookie.
    session.s3ProjectRoles = projectRoles;
    sessionChanged = true;
  }

  // Persist the latest role mapping before STS discovery or role assumption
  // can fail. OIDC refresh-token rotation is persisted by the refresh helper.
  if (sessionChanged) {
    await saveOidcSessionIfAuthoritative(session, authority);
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
  await saveOidcSessionIfAuthoritative(session, authority);
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
