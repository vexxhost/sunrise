import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  floatingIpQueryOptions,
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
  await fetchOpenStackResourceOrRecover(
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
      />
    </QueryHydrationBoundary>
  );
}
