import { getSession } from '@/lib/session';
import { finalizeKeystoneSession } from '@/lib/keystone/login';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? '/';

/**
 * Legacy Keystone WebSSO POST callback. Kept as a fallback for setups still
 * driving login through Keystone's federation endpoint. The unified Sunrise
 * OIDC flow at `/auth/oidc/login` is the preferred path.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const formData = await request.formData();
  const token = formData.get('token');

  if (typeof token !== 'string' || token.length === 0) {
    console.error('Missing token in WebSSO response');
    session.keystone_unscoped_token = undefined;
    session.keystoneProjectToken = undefined;
    session.projectId = undefined;
    session.regionId = undefined;
    await session.save();
    return new Response('Invalid WebSSO response', { status: 400 });
  }

  await finalizeKeystoneSession(session, token);
  await session.save();

  return Response.redirect(DASHBOARD_URL, 303);
}
import { getSession } from "@/lib/session";
import { readPrefs, writePrefs } from "@/lib/prefs";
import type { Project, Region } from "@/types/openstack/keystone";

const KEYSTONE_API = process.env.KEYSTONE_API;
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "/";

async function fetchProjects(token: string): Promise<Project[]> {
  if (!KEYSTONE_API) {
    console.error("Missing KEYSTONE_API environment variable");
    return [];
  }

  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        "X-Auth-Token": token,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch projects:", response.statusText);
      return [];
    }

    const data = (await response.json()) as { projects: Project[] };
    return data.projects ?? [];
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

async function fetchRegions(token: string): Promise<Region[]> {
  if (!KEYSTONE_API) {
    console.error("Missing KEYSTONE_API environment variable");
    return [];
  }

  try {
    const response = await fetch(`${KEYSTONE_API}/v3/regions`, {
      headers: {
        "X-Auth-Token": token,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch regions:", response.statusText);
      return [];
    }

    const data = (await response.json()) as { regions: Region[] };
    return data.regions ?? [];
  } catch (error) {
    console.error("Error fetching regions:", error);
    return [];
  }
}

async function getProjectScopedToken(
  unscopedToken: string,
  projectId: string,
): Promise<string | undefined> {
  if (!KEYSTONE_API) {
    console.error("Missing KEYSTONE_API environment variable");
    return undefined;
  }

  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ["token"],
            token: {
              id: unscopedToken,
            },
          },
          scope: {
            project: {
              id: projectId,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      console.error("Failed to fetch project-scoped token:", response.statusText);
      return undefined;
    }

    const scopedToken = response.headers.get("X-Subject-Token") ?? undefined;
    if (!scopedToken) {
      console.error("Missing X-Subject-Token header in scoped token response");
    }

    return scopedToken;
  } catch (error) {
    console.error("Error fetching project-scoped token:", error);
    return undefined;
  }
}

export async function POST(request: Request) {
  const session = await getSession();

  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || token.length === 0) {
    console.error("Missing token in WebSSO response");
    session.keystone_unscoped_token = undefined;
    session.keystoneProjectToken = undefined;
    session.projectId = undefined;
    session.regionId = undefined;
    await session.save();
    return new Response("Invalid WebSSO response", { status: 400 });
  }

  session.keystone_unscoped_token = token;

  const [projects, regions] = await Promise.all([
    fetchProjects(token),
    fetchRegions(token),
  ]);

  const prefs = await readPrefs();

  // TODO(diagnostic): remove these logs once project/region preference
  // restoration on login has been validated in additional environments.
  console.log('[websso] prefs:', prefs);
  console.log(
    '[websso] available projects:',
    projects.map((p) => ({ id: p.id, name: p.name }))
  );
  console.log(
    '[websso] available regions:',
    regions.map((r) => r.id)
  );

  // Resolve preferred project: prefer ID match (unique), fall back to name
  // match (handles project re-creation with new UUID, same display name).
  const previousProjectId = session.projectId ?? prefs.projectId;
  const previousProjectName = prefs.projectName;
  const candidateProject =
    (previousProjectId &&
      projects.find((project) => project.id === previousProjectId)) ??
    (previousProjectName &&
      projects.find((project) => project.name === previousProjectName)) ??
    projects[0];

  // TODO(diagnostic): remove with the logs above.
  console.log('[websso] picked project:', candidateProject ? { id: candidateProject.id, name: candidateProject.name } : null);

  if (candidateProject) {
    session.projectId = candidateProject.id;
    session.keystoneProjectToken = await getProjectScopedToken(token, candidateProject.id);
  } else {
    session.projectId = undefined;
    session.keystoneProjectToken = undefined;
  }

  const previousRegionId = session.regionId ?? prefs.regionId;
  const candidateRegion =
    (previousRegionId && regions.find((region) => region.id === previousRegionId)) ??
    regions[0];

  session.regionId = candidateRegion?.id ?? undefined;

  await session.save();
  await writePrefs({
    projectId: session.projectId,
    projectName: candidateProject?.name,
    regionId: session.regionId,
  });

  return Response.redirect(DASHBOARD_URL, 303);
}
