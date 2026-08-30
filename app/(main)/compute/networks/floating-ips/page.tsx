import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { floatingIpsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { FloatingIpsTableClient } from "../NetworkingTablesClient";

export default async function Page() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    floatingIpsQueryOptions(session.regionId, session.projectId),
  );
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FloatingIpsTableClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </HydrationBoundary>
  );
}
