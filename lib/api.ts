/**
 * Helper utilities for OpenStack API proxy URLs
 */

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
