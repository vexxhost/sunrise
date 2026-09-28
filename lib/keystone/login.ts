import 'server-only';
import type { IronSession } from 'iron-session';
import type { SunriseSession } from '@/lib/session';
import { readPrefs, writePrefs } from '@/lib/prefs';
import type { Project, Region } from '@/types/openstack/keystone';

function keystoneApi() {
  return process.env.KEYSTONE_API;
}

export class KeystoneSessionSetupError extends Error {
  constructor(
    public readonly reason: 'access-denied' | 'session-unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'KeystoneSessionSetupError';
  }
}

export type KeystoneSessionResolution =
  | { status: 'ready'; project: Project; region?: Region }
  | { status: 'no-projects'; region?: Region }
  | { status: 'no-role'; region?: Region };

function setupError(operation: string, status: number) {
  return new KeystoneSessionSetupError(
    status === 401 || status === 403 ? 'access-denied' : 'session-unavailable',
    `${operation} failed with status ${status}`,
  );
}

/**
 * Federate an OIDC id/access token into Keystone via its bearer-token
 * federation endpoint. Returns the unscoped Keystone token.
 *
 * Endpoint: POST /v3/OS-FEDERATION/identity_providers/{idp}/protocols/{protocol}/auth
 * with `Authorization: Bearer <token>`. mod_auth_openidc on the Keystone
 * Apache validates the bearer and Keystone middleware mints the federated
 * unscoped token returned in `X-Subject-Token`.
 */
export async function federateOidcWithKeystone(
  bearerToken: string,
  idProvider: string,
  protocol: string,
): Promise<string> {
  const KEYSTONE_API = keystoneApi();
  if (!KEYSTONE_API) throw new Error('KEYSTONE_API not set');
  const url = `${KEYSTONE_API}/v3/OS-FEDERATION/identity_providers/${encodeURIComponent(
    idProvider,
  )}/protocols/${encodeURIComponent(protocol)}/auth`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Keystone federation failed: ${res.status} ${res.statusText} ${text}`,
    );
  }
  const token = res.headers.get('X-Subject-Token');
  if (!token) throw new Error('Keystone federation: missing X-Subject-Token');
  return token;
}

export async function fetchProjects(token: string): Promise<Project[]> {
  const KEYSTONE_API = keystoneApi();
  if (!KEYSTONE_API) {
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      'KEYSTONE_API is not configured',
    );
  }
  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/projects`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw setupError('Project discovery', response.status);
    }
    const data = (await response.json()) as { projects: Project[] };
    return data.projects ?? [];
  } catch (e) {
    if (e instanceof KeystoneSessionSetupError) throw e;
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      e instanceof Error ? e.message : 'Project discovery failed',
    );
  }
}

export async function fetchRegions(token: string): Promise<Region[]> {
  const KEYSTONE_API = keystoneApi();
  if (!KEYSTONE_API) {
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      'KEYSTONE_API is not configured',
    );
  }
  try {
    const response = await fetch(`${KEYSTONE_API}/v3/regions`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw setupError('Region discovery', response.status);
    }
    const data = (await response.json()) as { regions: Region[] };
    return data.regions ?? [];
  } catch (e) {
    if (e instanceof KeystoneSessionSetupError) throw e;
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      e instanceof Error ? e.message : 'Region discovery failed',
    );
  }
}

async function requestProjectScopedToken(
  unscopedToken: string,
  projectId: string,
): Promise<string> {
  const KEYSTONE_API = keystoneApi();
  if (!KEYSTONE_API) {
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      'KEYSTONE_API is not configured',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${KEYSTONE_API}/v3/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['token'],
            token: { id: unscopedToken },
          },
          scope: { project: { id: projectId } },
        },
      }),
      cache: 'no-store',
    });
  } catch (error) {
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      error instanceof Error ? error.message : 'Project scoping failed',
    );
  }

  if (!response.ok) {
    throw setupError('Project scoping', response.status);
  }

  const token = response.headers.get('X-Subject-Token');
  if (!token) {
    throw new KeystoneSessionSetupError(
      'session-unavailable',
      'Project scoping response did not include a token',
    );
  }
  return token;
}

export async function getProjectScopedToken(
  unscopedToken: string,
  projectId: string,
): Promise<string | undefined> {
  try {
    return await requestProjectScopedToken(unscopedToken, projectId);
  } catch (e) {
    console.error('Error fetching project-scoped token:', e);
    return undefined;
  }
}

/**
 * Apply an unscoped Keystone token to the session and resolve the user's
 * preferred project + region (sticky across logouts via prefs cookie).
 * Caller is responsible for `await session.save()` afterwards.
 */
export async function finalizeKeystoneSession(
  session: IronSession<SunriseSession>,
  unscopedToken: string,
): Promise<KeystoneSessionResolution> {
  session.keystone_unscoped_token = unscopedToken;

  const [projects, regions] = await Promise.all([
    fetchProjects(unscopedToken),
    fetchRegions(unscopedToken),
  ]);

  const prefs = await readPrefs();

  const previousProjectId = session.projectId ?? prefs.projectId;
  const previousProjectName = prefs.projectName;
  const preferredProject =
    (previousProjectId
      ? projects.find((p) => p.id === previousProjectId)
      : undefined) ??
    (previousProjectName
      ? projects.find((p) => p.name === previousProjectName)
      : undefined) ??
    projects[0];

  const projectCandidates = preferredProject
    ? [
        preferredProject,
        ...projects.filter((project) => project.id !== preferredProject.id),
      ]
    : [];

  let selectedProject: Project | undefined;
  for (const project of projectCandidates) {
    try {
      const scopedToken = await requestProjectScopedToken(
        unscopedToken,
        project.id,
      );
      selectedProject = project;
      session.projectId = project.id;
      session.keystoneProjectToken = scopedToken;
      break;
    } catch (error) {
      if (
        error instanceof KeystoneSessionSetupError &&
        error.reason === 'access-denied'
      ) {
        continue;
      }
      throw error;
    }
  }

  if (!selectedProject) {
    session.projectId = undefined;
    session.keystoneProjectToken = undefined;
  }

  const previousRegionId = session.regionId ?? prefs.regionId;
  const candidateRegion =
    (previousRegionId
      ? regions.find((r) => r.id === previousRegionId)
      : undefined) ?? regions[0];
  session.regionId = candidateRegion?.id ?? undefined;

  await writePrefs({
    projectId: session.projectId,
    projectName: selectedProject?.name,
    regionId: session.regionId,
  });

  if (projects.length === 0) {
    return { status: 'no-projects', region: candidateRegion };
  }
  if (!selectedProject) {
    return { status: 'no-role', region: candidateRegion };
  }
  return {
    status: 'ready',
    project: selectedProject,
    region: candidateRegion,
  };
}
