import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  externalNetworksQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { RoutersTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
  NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
  NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { canManageNeutronAdminOnlyRouterSettings } from "@/lib/openstack/neutron-router-gateways";
import {
  parseNeutronTagFilterSearchParams,
  type NeutronTagFilterSearchParams,
} from "@/lib/openstack/neutron-tag-filters";

type RouterSearchParams = NeutronTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RouterSearchParams>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "router",
  );
  const parsedTagFilter = parseNeutronTagFilterSearchParams(pageSearchParams);
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const tagFilterPromise = parsedTagFilter.filter
    ? capabilitiesPromise.then((capabilities) =>
        extensionSupport(
          capabilities,
          NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
          "Router tag filters",
        ).status === "unsupported"
          ? undefined
          : parsedTagFilter.filter,
      )
    : Promise.resolve(undefined);
  const queryClient = makeQueryClient();
  await Promise.all([
    tagFilterPromise.then((tagFilter) =>
      queryClient.prefetchQuery(
        routersQueryOptions(session.regionId, session.projectId, tagFilter),
      ),
    ),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const tagFilter = await tagFilterPromise;
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Router tag filters",
  );
  const tagFilterError =
    parsedTagFilter.error ??
    (parsedTagFilter.filter && tagSupport.status === "unsupported"
      ? tagSupport.message
      : undefined);
  const availabilityZoneSupport = extensionSupport(
    capabilities,
    NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
    "Router availability-zone scheduling",
  );
  const defaultRouteBfdSupport = extensionSupport(
    capabilities,
    NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
    "Router default-route BFD",
  );
  const defaultRouteEcmpSupport = extensionSupport(
    capabilities,
    NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
    "Router default-route ECMP",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  const canManageAdminOnlyRouterSettings =
    canManageNeutronAdminOnlyRouterSettings(session.keystoneProjectRoles);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <RoutersTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        availabilityZoneSupport={availabilityZoneSupport}
        defaultRouteBfdSupport={defaultRouteBfdSupport}
        defaultRouteEcmpSupport={defaultRouteEcmpSupport}
        canManageAdminOnlyRouterSettings={canManageAdminOnlyRouterSettings}
        tagFilter={tagFilter}
        tagFilterError={tagFilterError}
        tagSupport={tagSupport}
      />
    </QueryHydrationBoundary>
  );
}
