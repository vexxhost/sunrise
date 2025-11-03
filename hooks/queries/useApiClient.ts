/**
 * Hook to get an API client configured with region and auth token
 */

import { useMemo } from 'react';
import ky from 'ky';
import { useKeystone } from '@/contexts/KeystoneContext';
import { useProjectToken } from './useProjectToken';

/**
 * Returns an API client configured for a specific service
 * The client automatically updates when region or token changes
 *
 * @param service - The OpenStack service name (e.g., 'nova', 'cinder', 'neutron')
 * @returns A ky instance configured with the service URL and auth header, or null if not ready
 *
 * @example
 * ```ts
 * const client = useApiClient('nova');
 * if (!client) return null; // Not ready yet
 *
 * const data = await client.get('servers/detail').json();
 * ```
 */
export function useApiClient(service: string) {
  const { region } = useKeystone();
  const { data: tokenData } = useProjectToken();

  return useMemo(() => {
    if (!region?.id || !tokenData?.token) return null;

    return ky.create({
      prefixUrl: `/api/proxy/${region.id}/${service}`,
      headers: {
        'X-Auth-Token': tokenData.token,
      },
    });
  }, [region?.id, service, tokenData?.token]);
}
