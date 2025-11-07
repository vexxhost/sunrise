import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { NetworksClient } from './NetworksClient';
import { networksQueryOptions } from '@/hooks/queries/useNetworks';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    networksQueryOptions(session.regionId, session.projectId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NetworksClient regionId={session.regionId} projectId={session.projectId} />
    </HydrationBoundary>
  );
}
