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

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      networkQueryOptions(session.regionId, session.projectId, id),
    ),
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
