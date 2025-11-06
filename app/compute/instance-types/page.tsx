import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { InstanceTypesClient } from './InstanceTypesClient';
import { flavorsQueryOptions } from '@/hooks/queries/useServers';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    flavorsQueryOptions(session.regionId, session.projectId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InstanceTypesClient regionId={session.regionId} projectId={session.projectId} />
    </HydrationBoundary>
  );
}
