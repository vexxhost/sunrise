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
  NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
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
  const mtuSupport = extensionSupport(
    capabilities,
    NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
    "Network MTU configuration",
  );
  const qosSupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_EXTENSION,
    "Network QoS policies",
  );
  const vlanTransparencySupport = extensionSupport(
    capabilities,
    NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
    "VLAN transparency",
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
        mtuSupport={mtuSupport}
        portSecuritySupport={portSecuritySupport}
        qosSupport={qosSupport}
        vlanTransparencySupport={vlanTransparencySupport}
      />
    </QueryHydrationBoundary>
  );
}
