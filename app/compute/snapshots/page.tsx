import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { SnapshotsClient } from './SnapshotsClient';
import { snapshotsQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    snapshotsQueryOptions(session.regionId, session.projectId)
  );

  return (
    <DataTableHydrationBoundary state={dehydrate(queryClient)}>
      <SnapshotsClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
