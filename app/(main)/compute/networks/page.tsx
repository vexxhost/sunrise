import { getSession } from "@/lib/session";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  externalNetworksQueryOptions,
  floatingIpsQueryOptions,
  networksQueryOptions,
  portsQueryOptions,
  routersQueryOptions,
  visibleSubnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { NetworkTopologyClient } from "./NetworkTopologyClient";

export default async function Page() {
  const session = await getSession();
  const projectId = session.projectId;
  const regionId = session.regionId;

  if (!projectId || !regionId) return null;

  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(networksQueryOptions(regionId, projectId)),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(regionId, projectId),
    ),
    queryClient.prefetchQuery(visibleSubnetsQueryOptions(regionId, projectId)),
    queryClient.prefetchQuery(routersQueryOptions(regionId, projectId)),
    queryClient.prefetchQuery(portsQueryOptions(regionId, projectId)),
    queryClient.prefetchQuery(floatingIpsQueryOptions(regionId, projectId)),
    queryClient.prefetchQuery(serversQueryOptions(regionId, projectId)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NetworkTopologyClient regionId={regionId} projectId={projectId} />
    </HydrationBoundary>
  );
}
