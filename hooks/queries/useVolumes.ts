/**
 * TanStack Query hooks for Cinder (Block Storage) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import type { Volume, Snapshot } from '@/lib/cinder';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of volumes
 */
export function useVolumes() {
  const { region, projectId } = useKeystone();
  const client = useApiClient('cinder');

  return useQuery({
    queryKey: [region, projectId, 'volumes'],
    queryFn: async () => {
      const data = await client!.get('volumes/detail').json<{ volumes: Volume[] }>();
      return data.volumes;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single volume by ID
 */
export function useVolume(id: string, options?: Omit<UseQueryOptions<Volume>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('cinder');

  return useQuery({
    queryKey: [region, projectId, 'volume', id],
    queryFn: async () => {
      const data = await client!.get(`volumes/${id}`).json<{ volume: Volume }>();
      return data.volume;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

/**
 * Hook to fetch list of snapshots
 */
export function useSnapshots() {
  const { region, projectId } = useKeystone();
  const client = useApiClient('cinder');

  return useQuery({
    queryKey: [region, projectId, 'snapshots'],
    queryFn: async () => {
      const data = await client!.get('snapshots/detail').json<{ snapshots: Snapshot[] }>();
      return data.snapshots;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single snapshot by ID
 */
export function useSnapshot(id: string, options?: Omit<UseQueryOptions<Snapshot>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('cinder');

  return useQuery({
    queryKey: [region, projectId, 'snapshot', id],
    queryFn: async () => {
      const data = await client!.get(`snapshots/${id}`).json<{ snapshot: Snapshot }>();
      return data.snapshot;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

