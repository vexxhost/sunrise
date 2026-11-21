/**
 * TanStack Query options for Glance (Image) API
 */

import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { Image, ImageListResponse } from '@/types/openstack';
import {
  glanceTagFilterApiPath,
  glanceTagFilterQueryKey,
  imageMatchesGlanceTagFilter,
  type GlanceTagFilter,
} from '@/lib/openstack/glance-tag-filters';

/**
 * Query options for fetching list of images
 */
export function imagesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  tagFilter?: GlanceTagFilter,
) {
  return queryOptions({
    queryKey: [
      regionId,
      projectId,
      'images',
      ...glanceTagFilterQueryKey(tagFilter),
    ],
    queryFn: async () => {
      const data = await openstack<ImageListResponse>({
        regionId: regionId!,
        serviceType: 'image',
        serviceName: 'glance',
        path: glanceTagFilterApiPath('/v2/images', tagFilter),
      });

      if (!data) {
        return [];
      }

      if (!tagFilter) return data.images;

      // Keep exact all-tag semantics even if an older Glance deployment
      // accepts but ignores one of the repeated tag query parameters.
      return data.images.filter((image) =>
        imageMatchesGlanceTagFilter(image.tags ?? [], tagFilter),
      );
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
        errorMode: 'throw',
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
