"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Cable, Route, Router as RouterIcon } from "lucide-react";

import {
  DisconnectRouterInterfaceAction,
  RouterDetailActions,
} from "@/components/Network/RouterDetailActions";
import {
  AddRouterRouteAction,
  RouterRouteRowActions,
} from "@/components/Network/RouterRouteActions";
import { Badge } from "@/components/ui/badge";
import {
  externalNetworksQueryOptions,
  routerPortsQueryOptions,
  routerQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { isRouterInterfacePort } from "@/lib/openstack/neutron-topology";

interface Props {
  id: string;
  projectId: string;
  regionId: string;
}

export function RouterDetailClient({ id, projectId, regionId }: Props) {
  const router = useSuspenseQuery(routerQueryOptions(regionId, projectId, id));
  const ports = useSuspenseQuery(
    routerPortsQueryOptions(regionId, projectId, id),
  );
  const subnets = useSuspenseQuery(subnetsQueryOptions(regionId, projectId));
  const externalNetworks = useSuspenseQuery(
    externalNetworksQueryOptions(regionId, projectId),
  );
  const subnetById = useMemo(
    () => new Map(subnets.data.map((subnet) => [subnet.id, subnet])),
    [subnets.data],
  );
  const interfacePorts = ports.data.filter(isRouterInterfacePort);
  const gatewayNetwork = externalNetworks.data.find(
    (network) => network.id === router.data.external_gateway_info?.network_id,
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
            routerResource={router.data}
            externalNetworks={externalNetworks.data}
            interfacePorts={interfacePorts}
            subnets={subnets.data}
            projectId={projectId}
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
            <p className="text-xs text-muted-foreground">External gateway</p>
            <p className="mt-2 truncate text-sm font-medium">
              {gatewayNetwork?.name || gatewayNetwork?.id || "Not connected"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">SNAT</p>
            <p className="mt-2 text-sm font-medium">
              {router.data.external_gateway_info?.enable_snat
                ? "Enabled"
                : "Disabled"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Interfaces</p>
            <p className="mt-2 text-sm font-medium">{interfacePorts.length}</p>
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Static routes</h3>
            <Badge variant="outline">{routes.length}</Badge>
          </div>
          {owned ? (
            <AddRouterRouteAction
              projectId={projectId}
              regionId={regionId}
              routerId={router.data.id}
              routes={routes}
            />
          ) : null}
        </div>
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
                  {owned ? (
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
                  <span className="truncate font-mono text-xs">{port.id}</span>
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
