import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  securityGroupQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { SecurityGroupDetailClient } from "./SecurityGroupDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_RBAC_SECURITY_GROUP_EXTENSION,
  NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
} from "@/lib/openstack/capabilities-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  const securityGroupQuery = securityGroupQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(securityGroupQuery),
    { kind: "security-group", id },
  );
  await queryClient.prefetchQuery(
    securityGroupsQueryOptions(session.regionId, session.projectId),
  );
  const capabilities = await capabilitiesPromise;
  const statefulSupport = extensionSupport(
    capabilities,
    NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
    "Security group connection tracking",
  );
  const rbacSecurityGroupSupport = extensionSupport(
    capabilities,
    NEUTRON_RBAC_SECURITY_GROUP_EXTENSION,
    "Security group sharing",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <SecurityGroupDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
        rbacSecurityGroupSupport={rbacSecurityGroupSupport}
        statefulSupport={statefulSupport}
      />
    </QueryHydrationBoundary>
  );
}
