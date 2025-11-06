'use server';

import { getSession } from '@/lib/session';

/**
 * Get user information from the project-scoped token in the session
 * This validates the token and extracts user details from Keystone
 */
export async function getUserInfo() {
  const session = await getSession();
  const token = session.keystoneProjectToken;

  if (!token) {
    return null;
  }

  try {
    // Validate token and get its details directly from Keystone
    const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
      method: 'GET',
      headers: {
        'X-Auth-Token': token,
        'X-Subject-Token': token,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { token: any };
    return {
      name: data.token?.user?.name,
      id: data.token?.user?.id,
    };
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

/**
 * Get list of regions from Keystone
 * Uses unscoped token from session
 */
export async function getRegionsAction() {
  const session = await getSession();
  const token = session.keystone_unscoped_token;

  if (!token) {
    return [];
  }

  try {
    const response = await fetch(`${process.env.KEYSTONE_API}/v3/regions`, {
      headers: {
        'X-Auth-Token': token,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error('Failed to fetch regions:', response.statusText);
      return [];
    }

    const data = await response.json() as { regions: any[] };
    // Sort regions alphabetically by ID
    return data.regions.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    console.error('Error fetching regions:', error);
    return [];
  }
}

/**
 * Get list of projects from Keystone
 * Uses unscoped token from session
 */
export async function getProjectsAction() {
  const session = await getSession();
  const token = session.keystone_unscoped_token;

  if (!token) {
    return [];
  }

  try {
    const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        'X-Auth-Token': token,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error('Failed to fetch projects:', response.statusText);
      return [];
    }

    const data = await response.json() as { projects: any[] };
    // Sort projects alphabetically by name
    return data.projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

