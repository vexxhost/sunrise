"use client";

import { useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Cable, Route, Router as RouterIcon } from "lucide-react";

import {
  DisconnectRouterInterfaceAction,
  RemoveRouterExternalGatewayAction,
  RouterDetailActions,
} from "@/components/Network/RouterDetailActions";
import { NeutronResourceTagsSection } from "@/components/Network/NeutronResourceTagsSection";
import { qosPolicyLabel } from "@/components/Network/QosPolicySelect";
import {
  AddRouterRouteAction,
  RouterRouteRowActions,
} from "@/components/Network/RouterRouteActions";
import { RouterConntrackHelperSection } from "@/components/Network/RouterConntrackHelperSection";
import { Badge } from "@/components/ui/badge";
import {
  externalNetworksQueryOptions,
  qosPoliciesQueryOptions,
  routerPortsQueryOptions,
  routerQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { isRouterInterfacePort } from "@/lib/openstack/neutron-topology";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  canRemoveRouterExternalGateway,
  routerExternalGatewayKey,
  routerExternalGatewayMultihomingAvailable,
  routerExternalGateways,
} from "@/lib/openstack/neutron-router-gateways";

interface Props {
  availabilityZoneSupport: OpenStackFeatureSupport;
  canManageAdminOnlyRouterSettings: boolean;
  conntrackHelperSupport: OpenStackFeatureSupport;
  defaultRouteBfdSupport: OpenStackFeatureSupport;
  defaultRouteEcmpSupport: OpenStackFeatureSupport;
  id: string;
  multihomingSupport: OpenStackFeatureSupport;
  projectId: string;
  qosGatewaySupport: OpenStackFeatureSupport;
  regionId: string;
  routeSupport: OpenStackFeatureSupport;
  tagSupport: OpenStackFeatureSupport;
}

export function RouterDetailClient({
  availabilityZoneSupport,
  canManageAdminOnlyRouterSettings,
  conntrackHelperSupport,
  defaultRouteBfdSupport,
  defaultRouteEcmpSupport,
  id,
  multihomingSupport,
  projectId,
  qosGatewaySupport,
  regionId,
  routeSupport,
  tagSupport,
}: Props) {
  const router = useSuspenseQuery(routerQueryOptions(regionId, projectId, id));
  const ports = useSuspenseQuery(
    routerPortsQueryOptions(regionId, projectId, id),
  );
  const subnets = useSuspenseQuery(subnetsQueryOptions(regionId, projectId));
  const externalNetworks = useSuspenseQuery(
    externalNetworksQueryOptions(regionId, projectId),
  );
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled:
      qosGatewaySupport.status !== "unsupported" ||
      Boolean(router.data.external_gateway_info?.qos_policy_id),
  });
  const subnetById = useMemo(
    () => new Map(subnets.data.map((subnet) => [subnet.id, subnet])),
    [subnets.data],
  );
  const interfacePorts = ports.data.filter(isRouterInterfacePort);
  const gateways = routerExternalGateways(router.data);
  const multihomingAvailable = routerExternalGatewayMultihomingAvailable(
    router.data,
    multihomingSupport,
  );
  const primaryGateway = gateways[0];
  const externalNetworkById = useMemo(
    () =>
      new Map(externalNetworks.data.map((network) => [network.id, network])),
    [externalNetworks.data],
  );
  const gatewayNetwork = externalNetworks.data.find(
    (network) => network.id === primaryGateway?.network_id,
  );
  const routes = router.data.routes ?? [];
  const owned =
    router.data.project_id === projectId || router.data.tenant_id === projectId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RouterIcon className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {router.data.name || router.data.id}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {router.data.id}
          </p>
        </div>
        {owned ? (
          <RouterDetailActions
            canManageAdminOnlyRouterSettings={canManageAdminOnlyRouterSettings}
            routerResource={router.data}
            externalNetworks={externalNetworks.data}
            interfacePorts={interfacePorts}
            subnets={subnets.data}
            projectId={projectId}
            defaultRouteBfdSupport={defaultRouteBfdSupport}
            defaultRouteEcmpSupport={defaultRouteEcmpSupport}
            multihomingAvailable={multihomingAvailable}
            qosGatewaySupport={qosGatewaySupport}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Router details</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge
              className="mt-2"
              variant={
                router.data.status === "ACTIVE" ? "secondary" : "outline"
              }
            >
              {router.data.status}
            </Badge>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">External gateways</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium">
              {gatewayNetwork ? (
                <ResourceLink
                  href={`/networking/networks/${encodeURIComponent(gatewayNetwork.id)}`}
                >
                  {gatewayNetwork.name || gatewayNetwork.id}
                </ResourceLink>
              ) : (
                "Not connected"
              )}
              {gateways.length > 1 ? (
                <Badge variant="outline">+{gateways.length - 1}</Badge>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">SNAT</p>
            <p className="mt-2 text-sm font-medium">
              {primaryGateway
                ? primaryGateway.enable_snat
                  ? "Enabled"
                  : "Disabled"
                : "Not configured"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Interfaces</p>
            <p className="mt-2 text-sm font-medium">{interfacePorts.length}</p>
          </div>
          {qosGatewaySupport.status !== "unsupported" ||
          router.data.external_gateway_info?.qos_policy_id ? (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Gateway QoS policy
              </p>
              <p className="mt-2 break-words text-sm font-medium">
                {qosPolicyLabel(
                  qosPolicies.data ?? [],
                  router.data.external_gateway_info?.qos_policy_id,
                )}
              </p>
            </div>
          ) : null}
          {availabilityZoneSupport.status === "unsupported" ? null : (
            <>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Availability zone hints
                </p>
                <p className="mt-2 break-words text-sm font-medium">
                  {router.data.availability_zone_hints?.join(", ") ||
                    "Cloud scheduler"}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Availability zones
                </p>
                <p className="mt-2 break-words text-sm font-medium">
                  {router.data.availability_zones?.join(", ") ||
                    "None reported"}
                </p>
              </div>
            </>
          )}
          {defaultRouteEcmpSupport.status !== "unsupported" ||
          router.data.enable_default_route_ecmp !== undefined ? (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Default-route ECMP
              </p>
              <p className="mt-2 text-sm font-medium">
                {router.data.enable_default_route_ecmp ? "Enabled" : "Disabled"}
              </p>
            </div>
          ) : null}
          {defaultRouteBfdSupport.status !== "unsupported" ||
          router.data.enable_default_route_bfd !== undefined ? (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Default-route BFD</p>
              <p className="mt-2 text-sm font-medium">
                {router.data.enable_default_route_bfd ? "Enabled" : "Disabled"}
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <NeutronResourceTagsSection
        owned={owned}
        projectId={projectId}
        regionId={regionId}
        resource={router.data}
        resourceType="router"
        support={tagSupport}
      />
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cable className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">External gateways</h3>
          <Badge variant="outline">{gateways.length}</Badge>
        </div>
        {gateways.length ? (
          <div className="overflow-hidden rounded-md border">
            {gateways.map((gateway, index) => {
              const network = externalNetworkById.get(gateway.network_id);
              const networkLabel = network?.name || gateway.network_id;
              const removable = canRemoveRouterExternalGateway(
                gateway,
                gateways,
              );
              return (
                <div
                  key={routerExternalGatewayKey(gateway, index)}
                  className="grid gap-3 px-3 py-3 not-last:border-b sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_8rem_3rem] sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {network ? (
                        <ResourceLink
                          href={`/networking/networks/${encodeURIComponent(network.id)}`}
                        >
                          {networkLabel}
                        </ResourceLink>
                      ) : (
                        <span className="break-all font-mono text-xs">
                          {networkLabel}
                        </span>
                      )}
                      <Badge variant={index === 0 ? "secondary" : "outline"}>
                        {index === 0 ? "Primary" : "Additional"}
                      </Badge>
                    </div>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {gateway.network_id}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Fixed addresses
                    </p>
                    {gateway.external_fixed_ips.length ? (
                      gateway.external_fixed_ips.map((fixedIp) => (
                        <p
                          key={`${fixedIp.subnet_id}-${fixedIp.ip_address}`}
                          className="font-mono text-xs"
                        >
                          {fixedIp.ip_address}
                        </p>
                      ))
                    ) : (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>None reported</p>
                        {!removable ? (
                          <p>
                            This network has multiple unaddressed gateways, so
                            Neutron cannot identify one gateway to remove.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SNAT</p>
                    <p className="mt-1 text-sm">
                      {index === 0
                        ? gateway.enable_snat
                          ? "Enabled"
                          : "Disabled"
                        : "Primary only"}
                    </p>
                  </div>
                  <div>
                    {owned && multihomingAvailable ? (
                      <RemoveRouterExternalGatewayAction
                        gateway={gateway}
                        networkLabel={networkLabel}
                        removable={removable}
                        projectId={projectId}
                        regionId={regionId}
                        routerId={router.data.id}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No external gateways are configured on this router.
          </div>
        )}
      </section>
      <RouterConntrackHelperSection
        owned={owned}
        projectId={projectId}
        regionId={regionId}
        routerId={router.data.id}
        support={conntrackHelperSupport}
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Static routes</h3>
            <Badge variant="outline">{routes.length}</Badge>
          </div>
          {owned && routeSupport.status !== "unsupported" ? (
            <AddRouterRouteAction
              projectId={projectId}
              regionId={regionId}
              routerId={router.data.id}
              routes={routes}
            />
          ) : null}
        </div>
        {routeSupport.status === "unsupported" ? (
          <MutationAlert
            variant="info"
            title="Static route changes unavailable"
          >
            {routeSupport.message}
          </MutationAlert>
        ) : null}
        {routes.length ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_5rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Destination</span>
              <span>Next hop</span>
              <span />
            </div>
            {routes.map((route) => (
              <div
                key={`${route.destination}-${route.nexthop}`}
                className="grid grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_5rem] items-center px-3 py-2.5 text-sm not-last:border-b"
              >
                <span className="font-mono text-xs">{route.destination}</span>
                <span className="font-mono text-xs">{route.nexthop}</span>
                <span>
                  {owned && routeSupport.status !== "unsupported" ? (
                    <RouterRouteRowActions
                      projectId={projectId}
                      regionId={regionId}
                      route={route}
                      routerId={router.data.id}
                      routes={routes}
                    />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No static routes are configured on this router.
          </div>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cable className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Subnet interfaces</h3>
        </div>
        {interfacePorts.length ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[minmax(9rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_3rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Subnet</span>
              <span>Address</span>
              <span>Port</span>
              <span />
            </div>
            {interfacePorts
              .flatMap((port) =>
                port.fixed_ips.map((fixedIp) => ({
                  port,
                  fixedIp,
                  subnet: subnetById.get(fixedIp.subnet_id),
                })),
              )
              .map(({ port, fixedIp, subnet }) => (
                <div
                  key={`${port.id}-${fixedIp.subnet_id}`}
                  className="grid grid-cols-[minmax(9rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_3rem] items-center px-3 py-2.5 text-sm not-last:border-b"
                >
                  <span className="truncate">
                    {subnet?.name || subnet?.cidr || fixedIp.subnet_id}
                  </span>
                  <span className="font-mono text-xs">
                    {fixedIp.ip_address}
                  </span>
                  <span className="truncate font-mono text-xs">
                    <ResourceLink
                      href={`/networking/ports/${encodeURIComponent(port.id)}`}
                    >
                      {port.id}
                    </ResourceLink>
                  </span>
                  <span>
                    {owned && subnet ? (
                      <DisconnectRouterInterfaceAction
                        projectId={projectId}
                        regionId={regionId}
                        routerId={router.data.id}
                        subnet={subnet}
                      />
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No project subnets are connected to this router.
          </div>
        )}
      </section>
    </div>
  );
}
