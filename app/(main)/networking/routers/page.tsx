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
    "router",
  );
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      routersQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
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
      />
    </QueryHydrationBoundary>
  );
}
