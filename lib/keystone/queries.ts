import { getSession } from '@/lib/session';
import { getProjectScopedToken } from '@/lib/keystone/login';
import { isKeystoneAuthFailure } from '@/lib/keystone/session';
import type { Region, Project } from '@/types/openstack';
import { redirect } from 'next/navigation';

/**
 * Server-side function to fetch regions
 * Uses the unscoped token from the session
 */
export async function getRegions(): Promise<Region[]> {
  const session = await getSession();

  if (!session.keystone_unscoped_token) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/regions`, {
      headers: {
        'X-Auth-Token': session.keystone_unscoped_token,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('Error fetching regions:', error);
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/logout?reason=expired');
    }
    console.error('Failed to fetch regions:', response.statusText);
    return [];
  }

  try {
    const data = await response.json() as { regions: Region[] };
    const regions = data.regions.sort((a, b) => a.id.localeCompare(b.id));

    if (!session.regionId && regions.length > 0) {
      session.regionId = regions[0].id;
      await session.save();
    }

    return regions;
  } catch (error) {
    console.error('Error fetching regions:', error);
    return [];
  }
}

/**
 * Server-side function to fetch projects
 * Uses the unscoped token from the session
 */
export async function getProjects(): Promise<Project[]> {
  const session = await getSession();

  if (!session.keystone_unscoped_token) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        'X-Auth-Token': session.keystone_unscoped_token,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/logout?reason=expired');
    }
    console.error('Failed to fetch projects:', response.statusText);
    return [];
  }

  try {
    const data = await response.json() as { projects: Project[] };
    const projects = data.projects.sort((a, b) => a.name.localeCompare(b.name));

    if (!session.projectId && projects.length > 0) {
      const project = projects[0];
      const scopedToken = await getProjectScopedToken(
        session.keystone_unscoped_token,
        project.id
      );

      if (scopedToken) {
        session.projectId = project.id;
        session.keystoneProjectToken = scopedToken;
        await session.save();
      }
    }

    return projects;
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}
