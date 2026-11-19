import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  addressGroupsQueryOptions,
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
  NEUTRON_ADDRESS_GROUP_EXTENSION,
  NEUTRON_SECURITY_GROUP_REMOTE_ADDRESS_GROUP_EXTENSION,
  NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
} from "@/lib/openstack/capabilities-server";

function combinedAddressGroupSupport(
  resource: ReturnType<typeof extensionSupport>,
  remoteRules: ReturnType<typeof extensionSupport>,
) {
  return (
    [resource, remoteRules].find(
      (support) => support.status === "unsupported",
    ) ??
    [resource, remoteRules].find((support) => support.status === "unknown") ??
    remoteRules
  );
}

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
  const remoteAddressGroupSupport = extensionSupport(
    capabilities,
    NEUTRON_SECURITY_GROUP_REMOTE_ADDRESS_GROUP_EXTENSION,
    "Remote address groups in security rules",
  );
  const addressGroupResourceSupport = extensionSupport(
    capabilities,
    NEUTRON_ADDRESS_GROUP_EXTENSION,
    "Network address groups",
  );
  const addressGroupSupport = combinedAddressGroupSupport(
    addressGroupResourceSupport,
    remoteAddressGroupSupport,
  );
  if (addressGroupSupport.status !== "unsupported") {
    await queryClient.prefetchQuery(
      addressGroupsQueryOptions(session.regionId, session.projectId),
    );
  }
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <SecurityGroupDetailClient
        addressGroupSupport={addressGroupSupport}
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
        statefulSupport={statefulSupport}
      />
    </QueryHydrationBoundary>
  );
}
