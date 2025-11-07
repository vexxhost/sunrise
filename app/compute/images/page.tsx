import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { ImagesClient } from './ImagesClient';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    imagesQueryOptions(session.regionId, session.projectId)
  );

  return (
    <DataTableHydrationBoundary state={dehydrate(queryClient)}>
      <ImagesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
