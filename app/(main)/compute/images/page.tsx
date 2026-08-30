import { getSession } from '@/lib/session';
import { ImagesClient } from './ImagesClient';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { ImageActions } from '@/components/Image/ImageActions';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="image"
      actions={
        <ImageActions
          regionId={session.regionId}
          projectId={session.projectId}
        />
      }
      queries={[
        imagesQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <ImagesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
