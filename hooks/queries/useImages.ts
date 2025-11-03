/**
 * TanStack Query hooks for Glance (Image) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import type { Image } from '@/types/openstack';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of images
 */
export function useImages() {
  const { region, projectId } = useKeystone();
  const client = useApiClient('glance');

  return useQuery({
    queryKey: [region, projectId, 'images'],
    queryFn: async () => {
      const data = await client!.get('v2/images').json<{ images: Image[] }>();
      return data.images;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single image by ID
 */
export function useImage(id: string, options?: Omit<UseQueryOptions<Image>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('glance');

  return useQuery({
    queryKey: [region, projectId, 'image', id],
    queryFn: async () => {
      return client!.get(`v2/images/${id}`).json<Image>();
    },
    enabled: !!id && !!client,
    ...options,
  });
}
