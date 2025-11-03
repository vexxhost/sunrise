/**
 * TanStack Query hooks for Keystone (Identity) API
 */

import { useQuery } from '@tanstack/react-query';
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
 * Note: Regions are global and not region-specific, so no region in query key
 */
export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/keystone/v3/regions').json<{ regions: Region[] }>();
      // Sort regions alphabetically by ID
      const sortedRegions = data.regions.sort((a, b) => a.id.localeCompare(b.id));
      return sortedRegions;
    },
  });
}
