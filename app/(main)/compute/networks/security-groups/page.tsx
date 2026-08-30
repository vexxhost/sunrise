import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { SecurityGroupsTableClient } from "../NetworkingTablesClient";

export default async function Page() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    securityGroupsQueryOptions(session.regionId, session.projectId),
  );
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SecurityGroupsTableClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </HydrationBoundary>
  );
}
