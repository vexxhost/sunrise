import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { InstancesClient } from './InstancesClient';
import { serversQueryOptions, flavorsQueryOptions } from '@/hooks/queries/useServers';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(serversQueryOptions(session.regionId, session.projectId));
  queryClient.prefetchQuery(volumesQueryOptions(session.regionId, session.projectId));
  queryClient.prefetchQuery(imagesQueryOptions(session.regionId, session.projectId));
  queryClient.prefetchQuery(flavorsQueryOptions(session.regionId, session.projectId));

  return (
    <DataTableHydrationBoundary state={dehydrate(queryClient)}>
      <InstancesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
