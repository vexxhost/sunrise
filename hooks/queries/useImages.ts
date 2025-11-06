/**
 * TanStack Query hooks for Glance (Image) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystoneStore } from '@/stores/useKeystoneStore';
import type { Image, ImageListResponse } from '@/types/openstack';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of images
 */
export function useImages() {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('glance');

  return useQuery({
    queryKey: [region?.id, project?.id, 'images'],
    queryFn: async () => {
      const data = await client!.get('v2/images').json<ImageListResponse>();
      return data.images;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single image by ID
 */
export function useImage(id: string, options?: Omit<UseQueryOptions<Image>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('glance');

  return useQuery({
    queryKey: [region?.id, project?.id, 'image', id],
    queryFn: async () => {
      // Glance API returns the image object directly (not wrapped)
      return client!.get(`v2/images/${id}`).json<Image>();
    },
    enabled: !!id && !!client,
    ...options,
  });
}
