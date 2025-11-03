/**
 * Helper utilities for OpenStack API proxy URLs
 */

import ky from 'ky';

/**
 * Generates a proxy URL for an OpenStack service endpoint
 *
 * @param region - The OpenStack region (e.g., 'us-east-1')
 * @param service - The OpenStack service name (e.g., 'nova', 'cinder', 'neutron')
 * @param path - The API path (e.g., 'servers/detail', 'v2.1/servers')
 * @returns The full proxy URL path
 *
 * @example
 * ```ts
 * apiUrl('us-east-1', 'nova', 'servers/detail')
 * // => '/api/proxy/us-east-1/nova/servers/detail'
 *
 * apiUrl('us-east-1', 'cinder', 'volumes/detail')
 * // => '/api/proxy/us-east-1/cinder/volumes/detail'
 * ```
 */
export function apiUrl(region: string, service: string, path: string): string {
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `/api/proxy/${region}/${service}/${cleanPath}`;
}

/**
 * Creates a ky instance configured with the OpenStack API proxy URL and X-Auth-Token header
 *
 * @param region - The OpenStack region (e.g., 'us-east-1')
 * @param service - The OpenStack service name (e.g., 'nova', 'cinder', 'neutron')
 * @param token - The OpenStack authentication token
 * @returns A ky instance configured with the base URL and auth header
 *
 * @example
 * ```ts
 * const client = apiClient('us-east-1', 'nova', 'my-token');
 * const data = await client.get('servers/detail').json();
 * ```
 */
export function apiClient(region: string, service: string, token: string) {
  return ky.create({
    prefixUrl: `/api/proxy/${region}/${service}`,
    headers: {
      'X-Auth-Token': token,
    },
  });
}
