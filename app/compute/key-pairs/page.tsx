import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { KeypairsTable } from './KeypairsTable';
import { keypairsQueryOptions } from '@/hooks/queries/useServers';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    keypairsQueryOptions(session.regionId, session.projectId)
  );

  return (
    <DataTableHydrationBoundary state={dehydrate(queryClient)}>
      <KeypairsTable regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
