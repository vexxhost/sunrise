/**
 * TanStack Query hooks for Keystone (Identity) API
 */

import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import ky from 'ky';

export type Region = {
  id: string;
  description?: string;
  parent_region_id?: string;
  links: {
    self: string;
  };
};

/**
 * Hook to fetch list of regions
 * Note: Regions are global and not region-specific, so we use 'global' as the region
 * Uses unscoped token from server session via __UNSCOPED__ marker
 */
export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const data = await ky.get(apiUrl('global', 'keystone', 'v3/regions'), {
        headers: {
          'X-Auth-Token': '__UNSCOPED__', // Special marker for proxy to use session's unscoped token
        },
      }).json<{ regions: Region[] }>();
      // Sort regions alphabetically by ID
      const sortedRegions = data.regions.sort((a, b) => a.id.localeCompare(b.id));
      return sortedRegions;
    },
  });
}
