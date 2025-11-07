import { getSession } from '@/lib/session';
import type { Region, Project } from '@/types/openstack';

/**
 * Server-side function to fetch regions
 * Uses the unscoped token from the session
 */
export async function getRegions(): Promise<Region[]> {
  const session = await getSession();

  if (!session.keystone_unscoped_token) {
    return [];
  }

  try {
    const response = await fetch(`${process.env.KEYSTONE_API}/v3/regions`, {
      headers: {
        'X-Auth-Token': session.keystone_unscoped_token,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error('Failed to fetch regions:', response.statusText);
      return [];
    }

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

  try {
    const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        'X-Auth-Token': session.keystone_unscoped_token,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error('Failed to fetch projects:', response.statusText);
      return [];
    }

    const data = await response.json() as { projects: Project[] };
    const projects = data.projects.sort((a, b) => a.name.localeCompare(b.name));

    if (!session.projectId && projects.length > 0) {
      session.projectId = projects[0].id;
      await session.save();
    }

    return projects;
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}
