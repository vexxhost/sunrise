import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  networksQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { PortsTableClient } from "../NetworkingTablesClient";
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
    "port",
  );
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      portsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      networksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PortsTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
      />
    </HydrationBoundary>
  );
}
