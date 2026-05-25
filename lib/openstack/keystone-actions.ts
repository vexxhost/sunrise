'use server';

import { getSession } from '@/lib/session';
import { isKeystoneAuthFailure } from '@/lib/keystone/session';
import { redirect } from 'next/navigation';

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

  let response: Response;
  try {
    // Validate token and get its details directly from Keystone
    response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
      method: 'GET',
      headers: {
        'X-Auth-Token': token,
        'X-Subject-Token': token,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/logout?reason=expired');
    }
    return null;
  }

  try {
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

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/regions`, {
      headers: {
        'X-Auth-Token': token,
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

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        'X-Auth-Token': token,
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
    const data = await response.json() as { projects: any[] };
    // Sort projects alphabetically by name
    return data.projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}
