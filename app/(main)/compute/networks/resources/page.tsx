import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { NetworksTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "network",
  );
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      projectNetworksQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      subnetsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NetworksTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
      />
    </HydrationBoundary>
  );
}
