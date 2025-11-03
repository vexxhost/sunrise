/**
 * TanStack Query hooks for Glance (Image) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import { apiUrl } from '@/lib/api';
import ky from 'ky';
import type { Image } from '@/lib/glance';

/**
 * Hook to fetch list of images
 */
export function useImages() {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'images'],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'glance', 'v2/images')).json<{ images: Image[] }>();
      return data.images;
    },
  });
}

/**
 * Hook to fetch a single image by ID
 */
export function useImage(id: string, options?: Omit<UseQueryOptions<Image>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'image', id],
    queryFn: () => ky.get(apiUrl(region, 'glance', `v2/images/${id}`)).json<Image>(),
    enabled: !!id,
    ...options,
  });
}
