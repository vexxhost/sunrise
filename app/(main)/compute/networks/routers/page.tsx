import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  externalNetworksQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { RoutersTableClient } from "../NetworkingTablesClient";

export default async function Page() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      routersQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RoutersTableClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </HydrationBoundary>
  );
}
