import 'server-only';
import type { IronSession } from 'iron-session';
import type { SunriseSession } from '@/lib/session';
import { readPrefs, writePrefs } from '@/lib/prefs';
import type { Project, Region } from '@/types/openstack/keystone';

const KEYSTONE_API = process.env.KEYSTONE_API;

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
  protocol: string
): Promise<string> {
  if (!KEYSTONE_API) throw new Error('KEYSTONE_API not set');
  const url = `${KEYSTONE_API}/v3/OS-FEDERATION/identity_providers/${encodeURIComponent(
    idProvider
  )}/protocols/${encodeURIComponent(protocol)}/auth`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Keystone federation failed: ${res.status} ${res.statusText} ${text}`
    );
  }
  const token = res.headers.get('X-Subject-Token');
  if (!token) throw new Error('Keystone federation: missing X-Subject-Token');
  return token;
}

export async function fetchProjects(token: string): Promise<Project[]> {
  if (!KEYSTONE_API) return [];
  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/projects`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('Failed to fetch projects:', response.statusText);
      return [];
    }
    const data = (await response.json()) as { projects: Project[] };
    return data.projects ?? [];
  } catch (e) {
    console.error('Error fetching projects:', e);
    return [];
  }
}

export async function fetchRegions(token: string): Promise<Region[]> {
  if (!KEYSTONE_API) return [];
  try {
    const response = await fetch(`${KEYSTONE_API}/v3/regions`, {
      headers: { 'X-Auth-Token': token },
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('Failed to fetch regions:', response.statusText);
      return [];
    }
    const data = (await response.json()) as { regions: Region[] };
    return data.regions ?? [];
  } catch (e) {
    console.error('Error fetching regions:', e);
    return [];
  }
}

export async function getProjectScopedToken(
  unscopedToken: string,
  projectId: string
): Promise<string | undefined> {
  if (!KEYSTONE_API) return undefined;
  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/tokens`, {
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
    });
    if (!response.ok) {
      console.error(
        'Failed to fetch project-scoped token:',
        response.statusText
      );
      return undefined;
    }
    return response.headers.get('X-Subject-Token') ?? undefined;
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
  unscopedToken: string
): Promise<void> {
  session.keystone_unscoped_token = unscopedToken;

  const [projects, regions] = await Promise.all([
    fetchProjects(unscopedToken),
    fetchRegions(unscopedToken),
  ]);

  const prefs = await readPrefs();

  const previousProjectId = session.projectId ?? prefs.projectId;
  const previousProjectName = prefs.projectName;
  const candidateProject =
    (previousProjectId &&
      projects.find((p) => p.id === previousProjectId)) ??
    (previousProjectName &&
      projects.find((p) => p.name === previousProjectName)) ??
    projects[0];

  if (candidateProject) {
    session.projectId = candidateProject.id;
    session.keystoneProjectToken = await getProjectScopedToken(
      unscopedToken,
      candidateProject.id
    );
  } else {
    session.projectId = undefined;
    session.keystoneProjectToken = undefined;
  }

  const previousRegionId = session.regionId ?? prefs.regionId;
  const candidateRegion =
    (previousRegionId && regions.find((r) => r.id === previousRegionId)) ??
    regions[0];
  session.regionId = candidateRegion?.id ?? undefined;

  await writePrefs({
    projectId: session.projectId,
    projectName: candidateProject?.name,
    regionId: session.regionId,
  });
}
