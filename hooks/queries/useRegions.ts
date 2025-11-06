/**
 * TanStack Query hooks for Keystone (Identity) API
 */

import { useQuery } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { Region } from '@/types/openstack';

/**
 * Hook to fetch list of regions
 * Note: Regions are global and not region-specific
 * Uses unscoped token from server session
 */
export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const data = await openstack<{ regions: Region[] }>({
        regionId: 'global',
        serviceType: 'identity',
        serviceName: 'keystone',
        path: '/v3/regions',
        unscoped: true,
      });

      if (!data) {
        return [];
      }

      // Sort regions alphabetically by ID
      return data.regions.sort((a, b) => a.id.localeCompare(b.id));
    },
  });
}
