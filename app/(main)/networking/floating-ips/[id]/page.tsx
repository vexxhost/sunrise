import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  floatingIpQueryOptions,
  floatingIpPortForwardingsQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { FloatingIpDetailClient } from "./FloatingIpDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_DESCRIPTION_EXTENSION,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_PORT_RANGES_EXTENSION,
  NEUTRON_QOS_FLOATING_IP_EXTENSION,
  NEUTRON_QOS_FLOATING_IP_NETWORK_POLICY_EXTENSION,
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
  const floatingIpQuery = floatingIpQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const floatingIp = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(floatingIpQuery),
    { kind: "floating-ip", id },
  );
  await queryClient.prefetchQuery(
    portsQueryOptions(session.regionId, session.projectId),
  );
  const capabilities = await capabilitiesPromise;
  const dnsIntegrationSupport = extensionSupport(
    capabilities,
    NEUTRON_DNS_INTEGRATION_EXTENSION,
    "Floating IP DNS records",
  );
  const qosSupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_FLOATING_IP_EXTENSION,
    "Floating IP QoS policies",
  );
  const qosNetworkPolicySupport = extensionSupport(
    capabilities,
    NEUTRON_QOS_FLOATING_IP_NETWORK_POLICY_EXTENSION,
    "Inherited floating IP QoS policies",
  );
  const portForwardingSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION,
    "Floating IP port forwarding",
  );
  const portForwardingDescriptionSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_DESCRIPTION_EXTENSION,
    "Floating IP port forwarding descriptions",
  );
  const portForwardingRangeSupport = extensionSupport(
    capabilities,
    NEUTRON_FLOATING_IP_PORT_FORWARDING_PORT_RANGES_EXTENSION,
    "Floating IP port forwarding ranges",
  );
  const owned =
    floatingIp.project_id === session.projectId ||
    floatingIp.tenant_id === session.projectId;
  if (owned && portForwardingSupport.status !== "unsupported") {
    await queryClient.prefetchQuery(
      floatingIpPortForwardingsQueryOptions(
        session.regionId,
        session.projectId,
        id,
      ),
    );
  }
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <FloatingIpDetailClient
        dnsIntegrationSupport={dnsIntegrationSupport}
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        portForwardingDescriptionSupport={portForwardingDescriptionSupport}
        portForwardingRangeSupport={portForwardingRangeSupport}
        portForwardingSupport={portForwardingSupport}
      />
    </QueryHydrationBoundary>
  );
}
