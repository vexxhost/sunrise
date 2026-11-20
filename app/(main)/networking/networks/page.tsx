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
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
  NEUTRON_VLAN_TRANSPARENCY_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  parseNeutronTagFilterSearchParams,
  type NeutronTagFilterSearchParams,
} from "@/lib/openstack/neutron-tag-filters";

type NetworkSearchParams = NeutronTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<NetworkSearchParams>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "network",
  );
  const parsedTagFilter = parseNeutronTagFilterSearchParams(pageSearchParams);
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const tagFilterPromise = parsedTagFilter.filter
    ? capabilitiesPromise.then((capabilities) =>
        extensionSupport(
          capabilities,
          NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
          "Network tag filters",
        ).status === "unsupported"
          ? undefined
          : parsedTagFilter.filter,
      )
    : Promise.resolve(undefined);
  const queryClient = makeQueryClient();
  await Promise.all([
    tagFilterPromise.then((tagFilter) =>
      queryClient.prefetchQuery(
        projectNetworksQueryOptions(
          session.regionId,
          session.projectId,
          tagFilter,
        ),
      ),
    ),
    queryClient.prefetchQuery(
      subnetsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const tagFilter = await tagFilterPromise;
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Network tag filters",
  );
  const tagFilterError =
    parsedTagFilter.error ??
    (parsedTagFilter.filter && tagSupport.status === "unsupported"
      ? tagSupport.message
      : undefined);
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
        tagFilter={tagFilter}
        tagFilterError={tagFilterError}
        tagSupport={tagSupport}
        vlanTransparencySupport={vlanTransparencySupport}
      />
    </QueryHydrationBoundary>
  );
}
