/**
 * TanStack Query options for Glance (Image) API
 */

import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { Image, ImageListResponse } from '@/types/openstack';

/**
 * Query options for fetching list of images
 */
export function imagesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'images'],
    queryFn: async () => {
      const data = await openstack<ImageListResponse>({
        regionId: regionId!,
        serviceType: 'image',
        serviceName: 'glance',
        path: '/v2/images',
      });

      if (!data) {
        return [];
      }

      return data.images;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single image by ID
 */
export function imageQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'image', id],
    queryFn: async () => {
      const data = await openstack<Image>({
        regionId: regionId!,
        serviceType: 'image',
        serviceName: 'glance',
        path: `/v2/images/${id}`,
      });

      if (!data) {
        throw new Error('Image not found');
      }

      // Glance API returns the image object directly (not wrapped)
      return data;
    },
    enabled: !!id && !!regionId,
  });
}
