import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { VolumesClient } from './VolumesClient';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';

export default async function Page() {
  const session = await getSession();

  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    volumesQueryOptions(session.regionId, session.projectId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VolumesClient regionId={session.regionId} projectId={session.projectId} />
    </HydrationBoundary>
  );
}
