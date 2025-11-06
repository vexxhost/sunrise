/**
 * TanStack Query options for Cinder (Block Storage) API
 */

import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { Volume, Snapshot } from '@/types/openstack';

/**
 * Query options for fetching list of volumes
 */
export function volumesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'volumes'],
    queryFn: async () => {
      const data = await openstack<{ volumes: Volume[] }>({
        regionId: regionId!,
        serviceType: 'volumev3',
        serviceName: 'cinder',
        path: '/volumes/detail',
      });

      if (!data) {
        return [];
      }

      return data.volumes;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single volume by ID
 */
export function volumeQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'volume', id],
    queryFn: async () => {
      const data = await openstack<{ volume: Volume }>({
        regionId: regionId!,
        serviceType: 'volumev3',
        serviceName: 'cinder',
        path: `/volumes/${id}`,
      });

      if (!data) {
        throw new Error('Volume not found');
      }

      return data.volume;
    },
    enabled: !!id && !!regionId,
  });
}

/**
 * Query options for fetching list of snapshots
 */
export function snapshotsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'snapshots'],
    queryFn: async () => {
      const data = await openstack<{ snapshots: Snapshot[] }>({
        regionId: regionId!,
        serviceType: 'volumev3',
        serviceName: 'cinder',
        path: '/snapshots/detail',
      });

      if (!data) {
        return [];
      }

      return data.snapshots;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single snapshot by ID
 */
export function snapshotQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'snapshot', id],
    queryFn: async () => {
      const data = await openstack<{ snapshot: Snapshot }>({
        regionId: regionId!,
        serviceType: 'volumev3',
        serviceName: 'cinder',
        path: `/snapshots/${id}`,
      });

      if (!data) {
        throw new Error('Snapshot not found');
      }

      return data.snapshot;
    },
    enabled: !!id && !!regionId,
  });
}
