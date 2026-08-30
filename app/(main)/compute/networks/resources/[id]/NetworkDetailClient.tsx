"use client";

import { Fragment, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { GitBranch, Network as NetworkIcon } from "lucide-react";

import { NetworkDetailActions } from "@/components/Network/NetworkDetailActions";
import { SubnetDetailActions } from "@/components/Network/SubnetDetailActions";
import { Badge } from "@/components/ui/badge";
import {
  networkQueryOptions,
  networkSubnetsQueryOptions,
  portsQueryOptions,
  routersQueryOptions,
} from "@/hooks/queries/useNetworks";
import { isRouterInterfacePort } from "@/lib/openstack/neutron-topology";
import { ResourceLink } from "@/components/resources/ResourceLink";

interface NetworkDetailClientProps {
  id: string;
  projectId: string;
  regionId: string;
}

function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y rounded-md border">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="min-w-0 break-words">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function NetworkDetailClient({
  id,
  projectId,
  regionId,
}: NetworkDetailClientProps) {
  const network = useSuspenseQuery(
    networkQueryOptions(regionId, projectId, id),
  );
  const subnets = useSuspenseQuery(
    networkSubnetsQueryOptions(regionId, projectId, id),
  );
  const routers = useSuspenseQuery(routersQueryOptions(regionId, projectId));
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const routerInterfaces = useMemo(
    () => ports.data.filter(isRouterInterfacePort),
    [ports.data],
  );
  const routerById = useMemo(
    () => new Map(routers.data.map((router) => [router.id, router])),
    [routers.data],
  );
  const owned =
    network.data.project_id === projectId ||
    network.data.tenant_id === projectId;
  const networkRows = useMemo<Array<[string, React.ReactNode]>>(
    () => [
      ["ID", network.data.id],
      [
        "Status",
        <Badge
          key="status"
          variant={network.data.status === "ACTIVE" ? "secondary" : "outline"}
        >
          {network.data.status}
        </Badge>,
      ],
      ["Description", network.data.description || "None"],
      ["Admin state", network.data.admin_state_up ? "Up" : "Down"],
      ["MTU", network.data.mtu],
      [
        "Port security",
        network.data.port_security_enabled ? "Enabled" : "Disabled",
      ],
      ["Shared", network.data.shared ? "Yes" : "No"],
      ["External", network.data["router:external"] ? "Yes" : "No"],
      [
        "Availability zones",
        network.data.availability_zones.join(", ") || "None reported",
      ],
    ],
    [network.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NetworkIcon className="size-5 text-muted-foreground" />
            <h2 className="break-words text-xl font-semibold">
              {network.data.name || network.data.id}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {network.data.id}
          </p>
        </div>
        {owned ? (
          <NetworkDetailActions
            network={network.data}
            projectId={projectId}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Network details</h3>
        <DetailGrid rows={networkRows} />
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Subnets</h3>
          <Badge variant="outline">{subnets.data.length}</Badge>
        </div>
        {subnets.data.length ? (
          <div className="overflow-x-auto rounded-md border">
            <div className="grid min-w-[76rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_6rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Name</span>
              <span>CIDR</span>
              <span>Allocation pools</span>
              <span>DNS servers</span>
              <span>Router</span>
              <span>DHCP</span>
              <span className="text-right">Actions</span>
            </div>
            {subnets.data.map((subnet) => {
              const connectedRouters = routerInterfaces
                .filter((port) =>
                  port.fixed_ips.some(
                    (fixedIp) => fixedIp.subnet_id === subnet.id,
                  ),
                )
                .map((port) => routerById.get(port.device_id))
                .filter((router) => router !== undefined);
              return (
                <div
                  key={subnet.id}
                  className="grid min-w-[76rem] grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_6rem] items-center px-3 py-2 text-sm not-last:border-b"
                >
                  <span className="truncate" title={subnet.name || subnet.id}>
                    {subnet.name || subnet.id}
                  </span>
                  <span className="font-mono text-xs">{subnet.cidr}</span>
                  <span className="truncate font-mono text-xs">
                    {subnet.allocation_pools.length
                      ? subnet.allocation_pools
                          .map((pool) => `${pool.start}–${pool.end}`)
                          .join(", ")
                      : "None"}
                  </span>
                  <span className="truncate font-mono text-xs">
                    {subnet.dns_nameservers.join(", ") || "Default"}
                  </span>
                  <span className="truncate">
                    {connectedRouters.length
                      ? connectedRouters.map((router, index) => (
                          <Fragment key={router.id}>
                            {index > 0 ? ", " : null}
                            <ResourceLink
                              href={`/compute/networks/routers/${encodeURIComponent(router.id)}`}
                            >
                              {router.name || router.id}
                            </ResourceLink>
                          </Fragment>
                        ))
                      : "Not attached"}
                  </span>
                  <span>{subnet.enable_dhcp ? "Enabled" : "Disabled"}</span>
                  <div className="flex justify-end">
                    <SubnetDetailActions
                      projectId={projectId}
                      regionId={regionId}
                      routerInterfaces={routerInterfaces}
                      routers={routers.data}
                      subnet={subnet}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No address space has been defined for this network.
          </div>
        )}
      </section>
    </div>
  );
}
