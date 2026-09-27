import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import {
  networkQueryOptions,
  networkSubnetsQueryOptions,
  portsQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { NetworkDetailClient } from "./NetworkDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  const networkQuery = networkQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(networkQuery),
    { kind: "network", id },
  );
  await Promise.all([
    queryClient.prefetchQuery(
      networkSubnetsQueryOptions(session.regionId, session.projectId, id),
    ),
    queryClient.prefetchQuery(
      routersQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      portsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NetworkDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </HydrationBoundary>
  );
}
