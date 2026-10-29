'use server';

import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logging';
import { isKeystoneAuthFailure } from '@/lib/keystone/session';
import { redirect } from 'next/navigation';
import { normalizeTokenRoles } from '@/lib/openstack/application-credential-schema';
import { openstackRequestId } from '@/lib/openstack/request-id';
import { currentSunriseRequestId } from '@/lib/request-correlation.server';

const logger = createLogger('keystone.action-query');

/**
 * Get user information from the project-scoped token in the session
 * This validates the token and extracts user details from Keystone
 */
export async function getUserInfo() {
  const requestId = await currentSunriseRequestId();
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
    logger.error('unreachable', { error, operation: 'get-user', requestId });
    return null;
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/refresh');
    }
    logger.warn('request-failed', {
      operation: 'get-user',
      requestId,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return null;
  }

  try {
    const data = await response.json() as { token: any };
    return {
      name: data.token?.user?.name,
      id: data.token?.user?.id,
      roles: normalizeTokenRoles(data.token?.roles),
      project:
        data.token?.project && typeof data.token.project === 'object'
          ? {
              id: data.token.project.id as string | undefined,
              name: data.token.project.name as string | undefined,
            }
          : undefined,
    };
  } catch (error) {
    logger.error('invalid-response', {
      error,
      operation: 'get-user',
      requestId,
    });
    return null;
  }
}

/**
 * Get list of regions from Keystone
 * Uses unscoped token from session
 */
export async function getRegionsAction() {
  const requestId = await currentSunriseRequestId();
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
    logger.error('unreachable', { error, operation: 'list-regions', requestId });
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/refresh');
    }
    logger.warn('request-failed', {
      operation: 'list-regions',
      requestId,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return [];
  }

  try {
    const data = await response.json() as { regions: any[] };
    // Sort regions alphabetically by ID
    return data.regions.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    logger.error('invalid-response', {
      error,
      operation: 'list-regions',
      requestId,
    });
    return [];
  }
}

/**
 * Get list of projects from Keystone
 * Uses unscoped token from session
 */
export async function getProjectsAction() {
  const requestId = await currentSunriseRequestId();
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
    logger.error('unreachable', {
      error,
      operation: 'list-projects',
      requestId,
    });
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect('/auth/refresh');
    }
    logger.warn('request-failed', {
      operation: 'list-projects',
      requestId,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return [];
  }

  try {
    const data = await response.json() as { projects: any[] };
    // Sort projects alphabetically by name
    return data.projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logger.error('invalid-response', {
      error,
      operation: 'list-projects',
      requestId,
    });
    return [];
  }
}
