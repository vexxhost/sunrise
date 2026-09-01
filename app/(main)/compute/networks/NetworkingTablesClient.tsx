"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  EthernetPort,
  Globe2,
  Network as NetworkIcon,
  Router as RouterIcon,
  ShieldCheck,
} from "lucide-react";

import { DataTable } from "@/components/DataTable";
import {
  AllocateFloatingIpAction,
  CreateNetworkAction,
  CreatePortAction,
  CreateRouterAction,
  CreateSecurityGroupAction,
} from "@/components/Network/NetworkingCreateActions";
import { Badge } from "@/components/ui/badge";
import {
  externalNetworksQueryOptions,
  floatingIpsQueryOptions,
  networksQueryOptions,
  portsQueryOptions,
  projectNetworksQueryOptions,
  routersQueryOptions,
  securityGroupsQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import type {
  FloatingIp,
  Network,
  Port,
  Router,
  SecurityGroup,
  Subnet,
} from "@/types/openstack";
import { ResourceLink } from "@/components/resources/ResourceLink";

interface NetworkingTableProps {
  projectId: string;
  regionId: string;
}

function NameLink({
  href,
  name,
  id,
}: {
  href: string;
  name: string;
  id: string;
}) {
  return (
    <ResourceLink href={href}>
      {name.trim() || id}
    </ResourceLink>
  );
}

function StateBadge({ active, label }: { active: boolean; label: string }) {
  return <Badge variant={active ? "secondary" : "outline"}>{label}</Badge>;
}

function TableIntro({
  action,
  children,
}: {
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

export function NetworksTableClient({
  projectId,
  regionId,
}: NetworkingTableProps) {
  const networks = useSuspenseQuery(
    projectNetworksQueryOptions(regionId, projectId),
  );
  const subnets = useSuspenseQuery(subnetsQueryOptions(regionId, projectId));
  const subnetById = useMemo(
    () => new Map(subnets.data.map((subnet) => [subnet.id, subnet])),
    [subnets.data],
  );
  const columns = useMemo<ColumnDef<Network>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/compute/networks/resources/${row.original.id}`}
            name={row.original.name}
            id={row.original.id}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "subnets",
        accessorFn: (network) =>
          network.subnets.map((id) => subnetById.get(id)?.cidr ?? id).join(" "),
        header: "Subnets",
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.subnets.length ? (
              row.original.subnets.map((id) => {
                const subnet = subnetById.get(id);
                return (
                  <div key={id} className="text-xs">
                    {subnet?.name || subnet?.cidr || id}
                  </div>
                );
              })
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StateBadge
            active={row.original.status === "ACTIVE"}
            label={row.original.status}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "admin_state_up",
        header: "Admin state",
        cell: ({ row }) => (
          <StateBadge
            active={row.original.admin_state_up}
            label={row.original.admin_state_up ? "Up" : "Down"}
          />
        ),
        meta: { fieldType: "boolean", visible: true },
      },
      {
        accessorKey: "mtu",
        header: "MTU",
        meta: { fieldType: "number", visible: true },
      },
      {
        accessorKey: "port_security_enabled",
        header: "Port security",
        cell: ({ row }) =>
          row.original.port_security_enabled ? "Enabled" : "Disabled",
        meta: { fieldType: "boolean", visible: false },
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: false },
      },
    ],
    [subnetById],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateNetworkAction projectId={projectId} regionId={regionId} />
        }
      >
        Project-owned layer 2 networks and their address spaces.
      </TableIntro>
      <DataTable
        columns={columns}
        data={networks.data}
        emptyIcon={NetworkIcon}
        isRefetching={networks.isRefetching || subnets.isRefetching}
        refetch={() => {
          void Promise.all([networks.refetch(), subnets.refetch()]);
        }}
        resourceName="network"
      />
    </>
  );
}

export function RoutersTableClient({
  projectId,
  regionId,
}: NetworkingTableProps) {
  const routers = useSuspenseQuery(routersQueryOptions(regionId, projectId));
  const externalNetworks = useSuspenseQuery(
    externalNetworksQueryOptions(regionId, projectId),
  );
  const externalById = useMemo(
    () =>
      new Map(externalNetworks.data.map((network) => [network.id, network])),
    [externalNetworks.data],
  );
  const columns = useMemo<ColumnDef<Router>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/compute/networks/routers/${row.original.id}`}
            name={row.original.name}
            id={row.original.id}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StateBadge
            active={row.original.status === "ACTIVE"}
            label={row.original.status}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "gateway",
        accessorFn: (router) =>
          externalById.get(router.external_gateway_info?.network_id ?? "")
            ?.name ?? "",
        header: "External gateway",
        cell: ({ row }) => {
          const gateway = row.original.external_gateway_info;
          if (!gateway)
            return <span className="text-muted-foreground">Not connected</span>;
          const gatewayNetwork = externalById.get(gateway.network_id);
          return (
            <ResourceLink
              href={`/compute/networks/resources/${encodeURIComponent(gateway.network_id)}`}
            >
              {gatewayNetwork?.name || gateway.network_id}
            </ResourceLink>
          );
        },
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "snat",
        accessorFn: (router) =>
          Boolean(router.external_gateway_info?.enable_snat),
        header: "SNAT",
        cell: ({ row }) =>
          row.original.external_gateway_info?.enable_snat
            ? "Enabled"
            : "Disabled",
        meta: { fieldType: "boolean", visible: true },
      },
      {
        accessorKey: "admin_state_up",
        header: "Admin state",
        cell: ({ row }) => (row.original.admin_state_up ? "Up" : "Down"),
        meta: { fieldType: "boolean", visible: false },
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: false },
      },
    ],
    [externalById],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateRouterAction projectId={projectId} regionId={regionId} />
        }
      >
        Layer 3 routing, subnet interfaces, and external gateways.
      </TableIntro>
      <DataTable
        columns={columns}
        data={routers.data}
        emptyIcon={RouterIcon}
        isRefetching={routers.isRefetching || externalNetworks.isRefetching}
        refetch={() => {
          void Promise.all([routers.refetch(), externalNetworks.refetch()]);
        }}
        resourceName="router"
      />
    </>
  );
}

export function PortsTableClient({
  projectId,
  regionId,
}: NetworkingTableProps) {
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const networks = useSuspenseQuery(networksQueryOptions(regionId, projectId));
  const networkById = useMemo(
    () => new Map(networks.data.map((network) => [network.id, network])),
    [networks.data],
  );
  const columns = useMemo<ColumnDef<Port>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/compute/networks/ports/${row.original.id}`}
            name={row.original.name}
            id={row.original.id}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "network",
        accessorFn: (port) =>
          networkById.get(port.network_id)?.name ?? port.network_id,
        header: "Network",
        cell: ({ row }) => (
          <ResourceLink
            href={`/compute/networks/resources/${encodeURIComponent(row.original.network_id)}`}
          >
            {networkById.get(row.original.network_id)?.name || row.original.network_id}
          </ResourceLink>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "fixed_ips",
        accessorFn: (port) =>
          port.fixed_ips.map((fixedIp) => fixedIp.ip_address).join(" "),
        header: "Fixed IPs",
        cell: ({ row }) =>
          row.original.fixed_ips.map((fixedIp) => (
            <div
              key={`${fixedIp.subnet_id}-${fixedIp.ip_address}`}
              className="text-xs"
            >
              {fixedIp.ip_address}
            </div>
          )),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StateBadge
            active={row.original.status === "ACTIVE"}
            label={row.original.status}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "device_owner",
        header: "Device owner",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "mac_address",
        header: "MAC address",
        meta: { fieldType: "string", visible: false, monospace: true },
      },
    ],
    [networkById],
  );

  return (
    <>
      <TableIntro
        action={<CreatePortAction projectId={projectId} regionId={regionId} />}
      >
        Virtual interfaces connecting project resources to networks.
      </TableIntro>
      <DataTable
        columns={columns}
        data={ports.data}
        emptyIcon={EthernetPort}
        isRefetching={ports.isRefetching || networks.isRefetching}
        refetch={() => {
          void Promise.all([ports.refetch(), networks.refetch()]);
        }}
        resourceName="port"
      />
    </>
  );
}

export function FloatingIpsTableClient({
  projectId,
  regionId,
}: NetworkingTableProps) {
  const floatingIps = useSuspenseQuery(
    floatingIpsQueryOptions(regionId, projectId),
  );
  const columns = useMemo<ColumnDef<FloatingIp>[]>(
    () => [
      {
        accessorKey: "floating_ip_address",
        header: "Floating IP",
        cell: ({ row }) => (
          <NameLink
            href={`/compute/networks/floating-ips/${row.original.id}`}
            name={row.original.floating_ip_address}
            id={row.original.id}
          />
        ),
        meta: { fieldType: "string", visible: true, monospace: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StateBadge
            active={row.original.status === "ACTIVE"}
            label={row.original.status}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "fixed_ip_address",
        header: "Fixed IP",
        cell: ({ row }) =>
          row.original.fixed_ip_address && row.original.port_id ? (
            <ResourceLink
              href={`/compute/networks/ports/${encodeURIComponent(row.original.port_id)}`}
              className="font-mono text-xs"
            >
              {row.original.fixed_ip_address}
            </ResourceLink>
          ) : (
            <span className="text-muted-foreground">Not associated</span>
          ),
        meta: { fieldType: "string", visible: true, monospace: true },
      },
      {
        accessorKey: "port_id",
        header: "Port ID",
        cell: ({ row }) =>
          row.original.port_id ? (
            <ResourceLink
              href={`/compute/networks/ports/${encodeURIComponent(row.original.port_id)}`}
              className="font-mono text-xs"
            >
              {row.original.port_id}
            </ResourceLink>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: true },
      },
    ],
    [],
  );

  return (
    <>
      <TableIntro
        action={
          <AllocateFloatingIpAction projectId={projectId} regionId={regionId} />
        }
      >
        Public addresses allocated to the active project.
      </TableIntro>
      <DataTable
        columns={columns}
        data={floatingIps.data}
        emptyIcon={Globe2}
        isRefetching={floatingIps.isRefetching}
        refetch={() => {
          void floatingIps.refetch();
        }}
        resourceName="floating IP"
      />
    </>
  );
}

export function SecurityGroupsTableClient({
  projectId,
  regionId,
}: NetworkingTableProps) {
  const groups = useSuspenseQuery(
    securityGroupsQueryOptions(regionId, projectId),
  );
  const columns = useMemo<ColumnDef<SecurityGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/compute/networks/security-groups/${row.original.id}`}
            name={row.original.name}
            id={row.original.id}
          />
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "rules",
        accessorFn: (group) => group.security_group_rules.length,
        header: "Rules",
        meta: { fieldType: "number", visible: true },
      },
      {
        accessorKey: "created_at",
        header: "Age",
        meta: { fieldType: "date", dateDisplay: "age", visible: false },
      },
    ],
    [],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateSecurityGroupAction
            projectId={projectId}
            regionId={regionId}
          />
        }
      >
        Stateful ingress and egress policy applied to project ports.
      </TableIntro>
      <DataTable
        columns={columns}
        data={groups.data}
        emptyIcon={ShieldCheck}
        isRefetching={groups.isRefetching}
        refetch={() => {
          void groups.refetch();
        }}
        resourceName="security group"
      />
    </>
  );
}
