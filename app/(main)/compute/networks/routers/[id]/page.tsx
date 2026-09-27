import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  externalNetworksQueryOptions,
  routerPortsQueryOptions,
  routerQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { RouterDetailClient } from "./RouterDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  const routerQuery = routerQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(routerQuery),
    { kind: "router", id },
  );
  await Promise.all([
    queryClient.prefetchQuery(
      routerPortsQueryOptions(session.regionId, session.projectId, id),
    ),
    queryClient.prefetchQuery(
      subnetsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RouterDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </HydrationBoundary>
  );
}
