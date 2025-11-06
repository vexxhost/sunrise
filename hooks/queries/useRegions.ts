/**
 * TanStack Query hooks for Keystone (Identity) API
 */

import { useQuery } from '@tanstack/react-query';
import { getRegionsAction } from '@/lib/openstack/keystone-actions';
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
      return await getRegionsAction();
    },
  });
}
