import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { KeypairListResponse } from '@/types/openstack';

/**
 * Shared query configuration for keypairs
 * Uses Server Action to call OpenStack API (reads token from session)
 */
export function keypairsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      const data = await openstack<KeypairListResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: '/os-keypairs',
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        return [];
      }

      return data.keypairs.map(item => item.keypair);
    },
    enabled: !!regionId,
  });
}
