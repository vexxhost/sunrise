/**
 * TanStack Query hooks for Glance (Image) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useRegion } from '@/contexts/RegionContext';
import ky from 'ky';
import type { Image } from '@/lib/glance';

/**
 * Hook to fetch list of images
 */
export function useImages() {
  const { region } = useRegion();

  return useQuery({
    queryKey: [region, 'images'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/glance/v2/images').json<{ images: Image[] }>();
      return data.images;
    },
  });
}

/**
 * Hook to fetch a single image by ID
 */
export function useImage(id: string, options?: Omit<UseQueryOptions<Image>, 'queryKey' | 'queryFn'>) {
  const { region } = useRegion();

  return useQuery({
    queryKey: [region, 'image', id],
    queryFn: () => ky.get(`/api/proxy/glance/v2/images/${id}`).json<Image>(),
    enabled: !!id,
    ...options,
  });
}
