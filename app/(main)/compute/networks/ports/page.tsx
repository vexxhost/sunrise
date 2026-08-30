import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  networksQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { PortsTableClient } from "../NetworkingTablesClient";

export default async function Page() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
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
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </HydrationBoundary>
  );
}
