import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { SecurityGroupsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
} from "@/lib/openstack/capabilities-server";

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
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  await queryClient.prefetchQuery(
    securityGroupsQueryOptions(session.regionId, session.projectId),
  );
  const statefulSupport = extensionSupport(
    await capabilitiesPromise,
    NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
    "Security group connection tracking",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <SecurityGroupsTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        statefulSupport={statefulSupport}
      />
    </QueryHydrationBoundary>
  );
}
