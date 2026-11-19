import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  networkQueryOptions,
  portQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { PortDetailClient } from "./PortDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
  NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
  NEUTRON_PORT_BINDING_EXTENSION,
  NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
  NEUTRON_PORT_IP_ALLOCATION_EXTENSION,
  NEUTRON_PORT_MAC_ADDRESS_REGENERATE_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
  NEUTRON_PORT_RESOURCE_REQUEST_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_QOS_PORT_NETWORK_POLICY_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_UPDATABLE_EXTENSION,
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
  const portQuery = portQueryOptions(session.regionId, session.projectId, id);
  const port = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(portQuery),
    { kind: "port", id },
  );
  const capabilities = await capabilitiesPromise;
  const securityGroupSupport = extensionSupport(
    capabilities,
    NEUTRON_SECURITY_GROUP_EXTENSION,
    "Security group assignment",
  );
  const allowedAddressPairsSupport = extensionSupport(
    capabilities,
    NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
    "Allowed address pairs",
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
  const hardwareOffloadSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
    "Port hardware offload",
  );
  const ipAllocationSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_IP_ALLOCATION_EXTENSION,
    "Port IP allocation state",
  );
  const portMacAddressRegenerationSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_MAC_ADDRESS_REGENERATE_EXTENSION,
    "Port MAC address regeneration",
  );
  const numaAffinitySupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
    "Port NUMA affinity",
  );
  const numaSocketSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
    "Socket-level port NUMA affinity",
  );
  const trustedVifSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
    "Trusted virtual interfaces",
  );
  const resourceRequestSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_RESOURCE_REQUEST_EXTENSION,
    "Port Placement requirements",
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
  const uplinkStatusPropagationUpdateSupport = extensionSupport(
    capabilities,
    NEUTRON_UPLINK_STATUS_PROPAGATION_UPDATABLE_EXTENSION,
    "Updating port uplink-status propagation",
  );
  await Promise.all([
    queryClient.prefetchQuery(
      networkQueryOptions(session.regionId, session.projectId, port.network_id),
    ),
    ...(securityGroupSupport.status === "unsupported"
      ? []
      : [
          queryClient.prefetchQuery(
            securityGroupsQueryOptions(session.regionId, session.projectId),
          ),
        ]),
    queryClient.prefetchQuery(
      serversQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const portSecuritySupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_SECURITY_EXTENSION,
    "Port security",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <PortDetailClient
        allowedAddressPairsSupport={allowedAddressPairsSupport}
        dnsDomainPortsSupport={dnsDomainPortsSupport}
        dnsIntegrationSupport={dnsIntegrationSupport}
        extraDhcpOptionsSupport={extraDhcpOptionsSupport}
        hardwareOffloadSupport={hardwareOffloadSupport}
        id={id}
        ipAllocationSupport={ipAllocationSupport}
        numaAffinitySupport={numaAffinitySupport}
        numaSocketSupport={numaSocketSupport}
        projectId={session.projectId}
        regionId={session.regionId}
        portSecuritySupport={portSecuritySupport}
        portBindingSupport={portBindingSupport}
        portMacAddressRegenerationSupport={portMacAddressRegenerationSupport}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        resourceRequestSupport={resourceRequestSupport}
        securityGroupSupport={securityGroupSupport}
        trustedVifSupport={trustedVifSupport}
        uplinkStatusPropagationSupport={uplinkStatusPropagationSupport}
        uplinkStatusPropagationUpdateSupport={
          uplinkStatusPropagationUpdateSupport
        }
      />
    </QueryHydrationBoundary>
  );
}
