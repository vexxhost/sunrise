/**
 * TanStack Query hooks for Cinder (Block Storage) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import ky from 'ky';
import type { Volume, Snapshot } from '@/lib/cinder';

/**
 * Hook to fetch list of volumes
 */
export function useVolumes() {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'volumes'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/cinder/volumes/detail').json<{ volumes: Volume[] }>();
      return data.volumes;
    },
  });
}

/**
 * Hook to fetch a single volume by ID
 */
export function useVolume(id: string, options?: Omit<UseQueryOptions<Volume>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'volume', id],
    queryFn: async () => {
      const data = await ky.get(`/api/proxy/cinder/volumes/${id}`).json<{ volume: Volume }>();
      return data.volume;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to fetch list of snapshots
 */
export function useSnapshots() {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'snapshots'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/cinder/snapshots/detail').json<{ snapshots: Snapshot[] }>();
      return data.snapshots;
    },
  });
}

/**
 * Hook to fetch a single snapshot by ID
 */
export function useSnapshot(id: string, options?: Omit<UseQueryOptions<Snapshot>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'snapshot', id],
    queryFn: async () => {
      const data = await ky.get(`/api/proxy/cinder/snapshots/${id}`).json<{ snapshot: Snapshot }>();
      return data.snapshot;
    },
    enabled: !!id,
    ...options,
  });
}

