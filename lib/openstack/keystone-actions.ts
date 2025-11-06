'use server';

import { getSession } from '@/lib/session';
import { getServiceEndpoint } from './catalog';

/**
 * Server Action to get a project-scoped token
 * Uses the unscoped token from session to request a scoped token
 */
export async function getProjectToken(projectId: string) {
  const session = await getSession();
  const unscopedToken = session.keystone_unscoped_token;

  if (!unscopedToken) {
    console.error('No unscoped token in session');
    return null;
  }

  // Get Keystone endpoint
  const endpoint = await getServiceEndpoint('global', 'identity', 'keystone', unscopedToken);
  if (!endpoint) {
    return null;
  }

  try {
    const response = await fetch(`${endpoint}/v3/auth/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': unscopedToken,
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['token'],
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
      console.error(`Failed to get project token: ${response.status} ${response.statusText}`);
      return null;
    }

    const token = response.headers.get('X-Subject-Token');
    const data = await response.json() as { token: any };

    return {
      token,
      data: data.token,
    };
  } catch (error) {
    console.error('Error getting project token:', error);
    return null;
  }
}
