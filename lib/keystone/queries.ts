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
    // Sort regions alphabetically by ID
    return data.regions.sort((a, b) => a.id.localeCompare(b.id));
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
    // Sort projects alphabetically by name
    return data.projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}
