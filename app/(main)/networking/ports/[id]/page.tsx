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
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_QOS_PORT_NETWORK_POLICY_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
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
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
        portSecuritySupport={portSecuritySupport}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        securityGroupSupport={securityGroupSupport}
      />
    </QueryHydrationBoundary>
  );
}
