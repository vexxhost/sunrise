import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  networksQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { PortsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
  NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
  NEUTRON_PORT_BINDING_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_QOS_PORT_NETWORK_POLICY_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
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
    "port",
  );
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      portsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      networksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const portSecuritySupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_SECURITY_EXTENSION,
    "Port security",
  );
  const allowedAddressPairsSupport = extensionSupport(
    capabilities,
    NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
    "Allowed address pairs",
  );
  const securityGroupSupport = extensionSupport(
    capabilities,
    NEUTRON_SECURITY_GROUP_EXTENSION,
    "Security group assignment",
  );
  const dnsIntegrationSupport = extensionSupport(
    capabilities,
    NEUTRON_DNS_INTEGRATION_EXTENSION,
    "Port DNS names",
  );
  const dnsDomainPortsSupport = extensionSupport(
    capabilities,
    NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
    "Per-port DNS domains",
  );
  const extraDhcpOptionsSupport = extensionSupport(
    capabilities,
    NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
    "Extra DHCP options",
  );
  const portBindingSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_BINDING_EXTENSION,
    "Port vNIC types",
  );
  const qosSupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_EXTENSION,
    "Port QoS policies",
  );
  const qosNetworkPolicySupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_PORT_NETWORK_POLICY_EXTENSION,
    "Inherited port QoS policies",
  );
  const uplinkStatusPropagationSupport = extensionSupport(
    capabilities,
    NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
    "Port uplink-status propagation",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <PortsTableClient
        allowedAddressPairsSupport={allowedAddressPairsSupport}
        dnsDomainPortsSupport={dnsDomainPortsSupport}
        dnsIntegrationSupport={dnsIntegrationSupport}
        extraDhcpOptionsSupport={extraDhcpOptionsSupport}
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        portSecuritySupport={portSecuritySupport}
        portBindingSupport={portBindingSupport}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        securityGroupSupport={securityGroupSupport}
        uplinkStatusPropagationSupport={uplinkStatusPropagationSupport}
      />
    </QueryHydrationBoundary>
  );
}
