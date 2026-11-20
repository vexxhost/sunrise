import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { floatingIpsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { FloatingIpsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
  NEUTRON_QOS_FLOATING_IP_EXTENSION,
  NEUTRON_QOS_FLOATING_IP_NETWORK_POLICY_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  parseNeutronTagFilterSearchParams,
  type NeutronTagFilterSearchParams,
} from "@/lib/openstack/neutron-tag-filters";

type FloatingIpSearchParams = NeutronTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FloatingIpSearchParams>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "floating-ip",
  );
  const parsedTagFilter = parseNeutronTagFilterSearchParams(pageSearchParams);
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const tagFilterPromise = parsedTagFilter.filter
    ? capabilitiesPromise.then((capabilities) =>
        extensionSupport(
          capabilities,
          NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
          "Floating IP tag filters",
        ).status === "unsupported"
          ? undefined
          : parsedTagFilter.filter,
      )
    : Promise.resolve(undefined);
  const queryClient = makeQueryClient();
  await tagFilterPromise.then((tagFilter) =>
    queryClient.prefetchQuery(
      floatingIpsQueryOptions(session.regionId, session.projectId, tagFilter),
    ),
  );
  const capabilities = await capabilitiesPromise;
  const tagFilter = await tagFilterPromise;
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Floating IP tag filters",
  );
  const tagFilterError =
    parsedTagFilter.error ??
    (parsedTagFilter.filter && tagSupport.status === "unsupported"
      ? tagSupport.message
      : undefined);
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
      <FloatingIpsTableClient
        key={createRequested ? "create" : "idle"}
        dnsIntegrationSupport={dnsIntegrationSupport}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        qosNetworkPolicySupport={qosNetworkPolicySupport}
        qosSupport={qosSupport}
        tagFilter={tagFilter}
        tagFilterError={tagFilterError}
        tagSupport={tagSupport}
      />
    </QueryHydrationBoundary>
  );
}
