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
  NEUTRON_ALLOWED_ADDRESS_PAIRS_REJECT_MULTICAST_EXTENSION,
  NEUTRON_DNS_DOMAIN_PORTS_EXTENSION,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION,
  NEUTRON_PORT_BINDING_EXTENSION,
  NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_PORT_TRUSTED_VIF_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_QOS_PORT_NETWORK_POLICY_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
  NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  parseNeutronTagFilterSearchParams,
  type NeutronTagFilterSearchParams,
} from "@/lib/openstack/neutron-tag-filters";

type PortSearchParams = NeutronTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<PortSearchParams>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "port",
  );
  const parsedTagFilter = parseNeutronTagFilterSearchParams(pageSearchParams);
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const tagFilterPromise = parsedTagFilter.filter
    ? capabilitiesPromise.then((capabilities) =>
        extensionSupport(
          capabilities,
          NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
          "Port tag filters",
        ).status === "unsupported"
          ? undefined
          : parsedTagFilter.filter,
      )
    : Promise.resolve(undefined);
  const queryClient = makeQueryClient();
  await Promise.all([
    tagFilterPromise.then((tagFilter) =>
      queryClient.prefetchQuery(
        portsQueryOptions(session.regionId, session.projectId, tagFilter),
      ),
    ),
    queryClient.prefetchQuery(
      networksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const tagFilter = await tagFilterPromise;
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Port tag filters",
  );
  const tagFilterError =
    parsedTagFilter.error ??
    (parsedTagFilter.filter && tagSupport.status === "unsupported"
      ? tagSupport.message
      : undefined);
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
  const allowedAddressPairsRejectMulticastSupport = extensionSupport(
    capabilities,
    NEUTRON_ALLOWED_ADDRESS_PAIRS_REJECT_MULTICAST_EXTENSION,
    "Multicast allowed-address-pair rejection",
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
  const hardwareOffloadSupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION,
    "Port hardware offload",
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
        rejectMulticastAddressPairs={
          allowedAddressPairsRejectMulticastSupport.status === "supported"
        }
        dnsDomainPortsSupport={dnsDomainPortsSupport}
        dnsIntegrationSupport={dnsIntegrationSupport}
        extraDhcpOptionsSupport={extraDhcpOptionsSupport}
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        hardwareOffloadSupport={hardwareOffloadSupport}
        numaAffinitySupport={numaAffinitySupport}
        numaSocketSupport={numaSocketSupport}
        portSecuritySupport={portSecuritySupport}
        portBindingSupport={portBindingSupport}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        securityGroupSupport={securityGroupSupport}
        tagFilter={tagFilter}
        tagFilterError={tagFilterError}
        tagSupport={tagSupport}
        trustedVifSupport={trustedVifSupport}
        uplinkStatusPropagationSupport={uplinkStatusPropagationSupport}
      />
    </QueryHydrationBoundary>
  );
}
