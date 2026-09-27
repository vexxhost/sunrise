import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  externalNetworksQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { RoutersTableClient } from "../NetworkingTablesClient";
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
    "router",
  );
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
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
      />
    </HydrationBoundary>
  );
}
