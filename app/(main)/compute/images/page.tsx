import { getSession } from '@/lib/session';
import { ImagesClient } from './ImagesClient';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { ImageActions } from '@/components/Image/ImageActions';
import { isCreateActionRequested } from '@/lib/create-actions';
import {
  parseGlanceTagFilterSearchParams,
  type GlanceTagFilterSearchParams,
} from '@/lib/openstack/glance-tag-filters';

type ImageSearchParams = GlanceTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ImageSearchParams>;
}) {
  const session = await getSession();
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    'image',
  );
  const parsedTagFilter = parseGlanceTagFilterSearchParams(pageSearchParams);

  return (
    <DataTableHydrationBoundary
      resourceName="image"
      actions={
        <ImageActions
          key={createRequested ? 'create' : 'idle'}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
        />
      }
      queries={[
        imagesQueryOptions(
          session.regionId,
          session.projectId,
          parsedTagFilter.filter,
        ),
      ]}
    >
      <ImagesClient
        regionId={session.regionId}
        projectId={session.projectId}
        tagFilter={parsedTagFilter.filter}
        tagFilterError={parsedTagFilter.error}
      />
    </DataTableHydrationBoundary>
  );
}
