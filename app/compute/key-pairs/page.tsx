import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { KeypairsTable } from './KeypairsTable';
import { keypairsQueryOptions } from './queries';

export default async function Page() {
  const queryClient = makeQueryClient();

  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  await queryClient.prefetchQuery(
    keypairsQueryOptions(regionId, projectId)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KeypairsTable regionId={regionId} projectId={projectId} />
    </HydrationBoundary>
  );
}
