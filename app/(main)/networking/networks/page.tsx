import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { NetworksTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_QOS_EXTENSION,
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
    "network",
  );
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      projectNetworksQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      subnetsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const availabilityZoneSupport = extensionSupport(
    capabilities,
    NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
    "Network availability-zone scheduling",
  );
  const dnsIntegrationSupport = extensionSupport(
    capabilities,
    NEUTRON_DNS_INTEGRATION_EXTENSION,
    "Network DNS domains",
  );
  const portSecuritySupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_SECURITY_EXTENSION,
    "Port security",
  );
  const qosSupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_EXTENSION,
    "Network QoS policies",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <NetworksTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        availabilityZoneSupport={availabilityZoneSupport}
        dnsIntegrationSupport={dnsIntegrationSupport}
        portSecuritySupport={portSecuritySupport}
        qosSupport={qosSupport}
      />
    </QueryHydrationBoundary>
  );
}
