import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { getNovaAuth } from './queries.server';
import { KeypairsTable } from './KeypairsTable';
import { keypairsQueryOptions } from './queries';

export default async function Page() {
  const queryClient = makeQueryClient();

  // Get region and project for the query key
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  // Get project-scoped token and Nova endpoint
  const auth = await getNovaAuth(regionId, projectId);

  // Prefetch keypairs data on the server (calls OpenStack API directly)
  if (auth) {
    await queryClient.prefetchQuery(
      keypairsQueryOptions(regionId, projectId, auth.token, auth.endpoint)
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KeypairsTable regionId={regionId} projectId={projectId} />
    </HydrationBoundary>
  );
}
