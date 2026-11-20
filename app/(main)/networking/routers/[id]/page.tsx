import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  externalNetworksQueryOptions,
  routerConntrackHelpersQueryOptions,
  routerPortsQueryOptions,
  routerQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { RouterDetailClient } from "./RouterDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION,
  NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
  NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
  NEUTRON_EXTERNAL_GATEWAY_MULTIHOMING_EXTENSION,
  NEUTRON_L3_CONNTRACK_HELPER_EXTENSION,
  NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
  NEUTRON_QOS_GATEWAY_IP_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { canManageNeutronAdminOnlyRouterSettings } from "@/lib/openstack/neutron-router-gateways";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const routeSupportPromise = capabilitiesPromise.then((capabilities) =>
    extensionSupport(
      capabilities,
      NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION,
      "Static router route changes",
    ),
  );
  const availabilityZoneSupportPromise = capabilitiesPromise.then(
    (capabilities) =>
      extensionSupport(
        capabilities,
        NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION,
        "Router availability zones",
      ),
  );
  const qosGatewaySupportPromise = capabilitiesPromise.then((capabilities) =>
    extensionSupport(
      capabilities,
      NEUTRON_QOS_GATEWAY_IP_EXTENSION,
      "Router gateway QoS policies",
    ),
  );
  const multihomingSupportPromise = capabilitiesPromise.then((capabilities) =>
    extensionSupport(
      capabilities,
      NEUTRON_EXTERNAL_GATEWAY_MULTIHOMING_EXTENSION,
      "Multiple router external gateways",
    ),
  );
  const defaultRouteBfdSupportPromise = capabilitiesPromise.then(
    (capabilities) =>
      extensionSupport(
        capabilities,
        NEUTRON_ENABLE_DEFAULT_ROUTE_BFD_EXTENSION,
        "Router default-route BFD",
      ),
  );
  const defaultRouteEcmpSupportPromise = capabilitiesPromise.then(
    (capabilities) =>
      extensionSupport(
        capabilities,
        NEUTRON_ENABLE_DEFAULT_ROUTE_ECMP_EXTENSION,
        "Router default-route ECMP",
      ),
  );
  const tagSupportPromise = capabilitiesPromise.then((capabilities) =>
    extensionSupport(
      capabilities,
      NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
      "Router tags",
    ),
  );
  const conntrackHelperSupportPromise = capabilitiesPromise.then(
    (capabilities) =>
      extensionSupport(
        capabilities,
        NEUTRON_L3_CONNTRACK_HELPER_EXTENSION,
        "Router conntrack helpers",
      ),
  );
  const queryClient = makeQueryClient();
  const routerQuery = routerQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const router = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(routerQuery),
    {
      kind: "router",
      id,
    },
  );
  const unconditionalPrefetchesPromise = Promise.all([
    queryClient.prefetchQuery(
      routerPortsQueryOptions(session.regionId, session.projectId, id),
    ),
    queryClient.prefetchQuery(
      subnetsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      externalNetworksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const conntrackHelperSupport = await conntrackHelperSupportPromise;
  const owned =
    router.project_id === session.projectId ||
    router.tenant_id === session.projectId;
  await Promise.all([
    unconditionalPrefetchesPromise,
    owned && conntrackHelperSupport.status !== "unsupported"
      ? queryClient.prefetchQuery(
          routerConntrackHelpersQueryOptions(
            session.regionId,
            session.projectId,
            id,
          ),
        )
      : Promise.resolve(),
  ]);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  const [
    availabilityZoneSupport,
    defaultRouteBfdSupport,
    defaultRouteEcmpSupport,
    multihomingSupport,
    qosGatewaySupport,
    routeSupport,
    tagSupport,
  ] = await Promise.all([
    availabilityZoneSupportPromise,
    defaultRouteBfdSupportPromise,
    defaultRouteEcmpSupportPromise,
    multihomingSupportPromise,
    qosGatewaySupportPromise,
    routeSupportPromise,
    tagSupportPromise,
  ]);
  const canManageAdminOnlyRouterSettings =
    canManageNeutronAdminOnlyRouterSettings(session.keystoneProjectRoles);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <RouterDetailClient
        id={id}
        availabilityZoneSupport={availabilityZoneSupport}
        canManageAdminOnlyRouterSettings={canManageAdminOnlyRouterSettings}
        conntrackHelperSupport={conntrackHelperSupport}
        defaultRouteBfdSupport={defaultRouteBfdSupport}
        defaultRouteEcmpSupport={defaultRouteEcmpSupport}
        multihomingSupport={multihomingSupport}
        projectId={session.projectId}
        regionId={session.regionId}
        routeSupport={routeSupport}
        tagSupport={tagSupport}
        qosGatewaySupport={qosGatewaySupport}
      />
    </QueryHydrationBoundary>
  );
}
