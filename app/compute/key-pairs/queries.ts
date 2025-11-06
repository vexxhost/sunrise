import { queryOptions } from '@tanstack/react-query';
import { getServiceEndpoint } from '@/lib/openstack/catalog';
import type { KeypairListResponse } from '@/types/openstack';

/**
 * Shared query configuration for keypairs
 * Server calls OpenStack API directly with token, client calls through proxy (uses session token)
 */
export function keypairsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  token?: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      let url: string;

      // Server-side with token: fetch endpoint from catalog and call directly
      if (token && regionId) {
        const endpoint = await getServiceEndpoint(regionId, 'compute', 'nova', token);
        if (!endpoint) {
          return [];
        }
        url = `${endpoint}/os-keypairs`;
      } else {
        // Client-side: use proxy (session token used by proxy)
        url = `/api/proxy/${regionId}/nova/os-keypairs`;
      }

      const headers: Record<string, string> = {
        'OpenStack-API-Version': 'compute 2.79',
      };

      if (token) {
        headers['X-Auth-Token'] = token;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as KeypairListResponse;
      return data.keypairs.map(item => item.keypair);
    },
  });
}
