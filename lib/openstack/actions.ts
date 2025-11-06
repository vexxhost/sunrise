'use server';

import { getSession } from '@/lib/session';
import { getServiceEndpoint } from './catalog';

interface OpenStackActionOptions {
  regionId: string;
  serviceType: string;
  serviceName: string;
  path: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
}

/**
 * Server Action for OpenStack API calls
 * Always uses session token, no need to pass token from client
 */
export async function openstack<T = any>(
  options: OpenStackActionOptions
): Promise<T | null> {
  const {
    regionId,
    serviceType,
    serviceName,
    path,
    apiVersion,
    headers: customHeaders = {},
    method = 'GET',
    body,
  } = options;

  // Get session token
  const session = await getSession();
  const token = session.keystoneProjectToken;

  if (!token) {
    console.error('No project token in session');
    return null;
  }

  // Get endpoint (always calls OpenStack directly on server)
  const endpoint = await getServiceEndpoint(regionId, serviceType, serviceName, token);
  if (!endpoint) {
    return null;
  }

  // Build headers
  const headers: Record<string, string> = {
    'X-Auth-Token': token,
    ...customHeaders,
  };

  // Add API version header if provided
  if (apiVersion) {
    headers['OpenStack-API-Version'] = apiVersion;
  }

  // Add content-type for requests with body
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Make the request
  const url = `${endpoint}${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      console.error(`OpenStack API error: ${response.status} ${response.statusText} for ${url}`);
      return null;
    }

    // Return parsed JSON
    try {
      return await response.json();
    } catch (error) {
      // Some APIs return empty responses
      return null;
    }
  } catch (error) {
    console.error('OpenStack fetch error:', error);
    return null;
  }
}
