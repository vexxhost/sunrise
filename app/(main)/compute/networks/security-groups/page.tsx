import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { SecurityGroupsTableClient } from "../NetworkingTablesClient";
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
    "security-group",
  );
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    securityGroupsQueryOptions(session.regionId, session.projectId),
  );
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SecurityGroupsTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
      />
    </HydrationBoundary>
  );
}
