import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { SnapshotsClient } from './SnapshotsClient';
import { snapshotsQueryOptions } from '@/hooks/queries/useVolumes';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    snapshotsQueryOptions(session.regionId, session.projectId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SnapshotsClient regionId={session.regionId} projectId={session.projectId} />
    </HydrationBoundary>
  );
}
