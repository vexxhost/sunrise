import { getSession } from '@/lib/session';
import { ImagesClient } from './ImagesClient';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { ImageActions } from '@/components/Image/ImageActions';
import { isCreateActionRequested } from '@/lib/create-actions';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    'image',
  );

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
      queries={[imagesQueryOptions(session.regionId, session.projectId)]}
    >
      <ImagesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
