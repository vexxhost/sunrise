import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";

import {
  networkQueryOptions,
  networkIpAvailabilityQueryOptions,
  networkSubnetsQueryOptions,
  portsQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { NetworkDetailClient } from "./NetworkDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_NETWORK_IP_AVAILABILITY_EXTENSION,
  NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_QOS_EXTENSION,
  NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION,
  NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
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
  const networkQuery = networkQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(networkQuery), {
    kind: "network",
    id,
  });
  await Promise.all([
    queryClient.prefetchQuery(
      networkSubnetsQueryOptions(session.regionId, session.projectId, id),
    ),
    queryClient.prefetchQuery(
      routersQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      portsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const availabilityZoneSupport = extensionSupport(
    capabilities,
    NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION,
    "Network availability zones",
  );
  const dnsIntegrationSupport = extensionSupport(
    capabilities,
    NEUTRON_DNS_INTEGRATION_EXTENSION,
    "Network DNS domains",
  );
  const ipAvailabilitySupport = extensionSupport(
    capabilities,
    NEUTRON_NETWORK_IP_AVAILABILITY_EXTENSION,
    "Network IP availability",
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
  const subnetDnsPublishSupport = extensionSupport(
    capabilities,
    NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION,
    "Subnet fixed-IP DNS publication",
  );
  const vlanTransparencySupport = extensionSupport(
    capabilities,
    NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
    "VLAN transparency",
  );
  if (ipAvailabilitySupport.status !== "unsupported") {
    await queryClient.prefetchQuery(
      networkIpAvailabilityQueryOptions(
        session.regionId,
        session.projectId,
        id,
      ),
    );
  }
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <NetworkDetailClient
        id={id}
        availabilityZoneSupport={availabilityZoneSupport}
        dnsIntegrationSupport={dnsIntegrationSupport}
        ipAvailabilitySupport={ipAvailabilitySupport}
        mtuSupport={mtuSupport}
        projectId={session.projectId}
        regionId={session.regionId}
        portSecuritySupport={portSecuritySupport}
        qosSupport={qosSupport}
        vlanTransparencySupport={vlanTransparencySupport}
        subnetDnsPublishSupport={subnetDnsPublishSupport}
      />
    </QueryHydrationBoundary>
  );
}
