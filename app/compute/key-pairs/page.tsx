import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { KeypairsTable } from './KeypairsTable';
import { keypairsQueryOptions } from './queries';

export default async function Page() {
  const queryClient = makeQueryClient();

  // Get region and project for the query key
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  // Get session token
  const session = await getSession();

  // Prefetch keypairs data on the server (fetches endpoint and calls OpenStack API directly)
  if (session.keystoneProjectToken) {
    await queryClient.prefetchQuery(
      keypairsQueryOptions(regionId, projectId, session.keystoneProjectToken)
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KeypairsTable regionId={regionId} projectId={projectId} />
    </HydrationBoundary>
  );
}
