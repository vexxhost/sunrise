import { queryOptions } from '@tanstack/react-query';
import type { Keypair, KeypairListResponse } from '@/types/openstack';

/**
 * Shared query configuration for keypairs
 * Server calls OpenStack API directly, client calls through proxy
 */
export function keypairsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  token: string,
  endpoint?: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      // Server provides endpoint, client uses proxy
      const url = endpoint
        ? `${endpoint}/os-keypairs`
        : `/api/proxy/${regionId}/nova/os-keypairs`;

      const response = await fetch(url, {
        headers: {
          'X-Auth-Token': token,
          'OpenStack-API-Version': 'compute 2.79',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as KeypairListResponse;
      // Nova returns keypairs as an array of objects with "keypair" property
      return data.keypairs.map(item => item.keypair);
    },
  });
}
