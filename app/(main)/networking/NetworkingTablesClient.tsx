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
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  neutronPortHardwareOffloadTypeLabel,
  neutronPortNumaAffinityPolicyLabel,
} from "@/lib/openstack/neutron-port-placement";
import { neutronPortVnicTypeLabel } from "@/lib/openstack/neutron-port-vnic-types";
import { routerExternalGateways } from "@/lib/openstack/neutron-router-gateways";
import { NeutronTagFilterControl } from "@/components/Network/NeutronTagFilter";
import {
  NeutronResourceTag,
  type NeutronTaggableResourceType,
} from "@/components/Network/NeutronResourceTag";
import type { NeutronTagFilter } from "@/lib/openstack/neutron-tag-filters";

interface NetworkingTableProps {
  projectId: string;
  regionId: string;
  initiallyOpen?: boolean;
  tagFilter?: NeutronTagFilter;
  tagFilterError?: string;
  tagSupport: OpenStackFeatureSupport;
}

const TAG_FILTER_VISIBLE_COLUMNS = ["tags"];

function NameLink({
  href,
  name,
  id,
}: {
  href: string;
  name: string;
  id: string;
}) {
  return <ResourceLink href={href}>{name.trim() || id}</ResourceLink>;
}

function StateBadge({ active, label }: { active: boolean; label: string }) {
  return <Badge variant={active ? "secondary" : "outline"}>{label}</Badge>;
}

function neutronTagColumn<T extends { tags?: string[] }>(
  resourceType: NeutronTaggableResourceType,
  support: OpenStackFeatureSupport,
) {
  return {
    id: "tags",
    accessorFn: (resource) => (resource.tags ?? []).join("\n"),
    header: "Tags",
    cell: ({ row }) => {
      const tags = row.original.tags ?? [];
      if (tags.length === 0) {
        return <span className="text-muted-foreground">None</span>;
      }
      return (
        <div className="flex max-w-64 flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => (
            <NeutronResourceTag
              key={tag}
              className="max-w-48"
              resourceType={resourceType}
              support={support}
              tag={tag}
              truncate
            />
          ))}
          {tags.length > 2 ? (
            <Badge variant="outline">+{tags.length - 2}</Badge>
          ) : null}
        </div>
      );
    },
    meta: { fieldType: "string", visible: false },
  } satisfies ColumnDef<T>;
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
  availabilityZoneSupport,
  dnsIntegrationSupport,
  mtuSupport,
  projectId,
  regionId,
  initiallyOpen = false,
  portSecuritySupport,
  qosSupport,
  tagFilter,
  tagFilterError,
  tagSupport,
  vlanTransparencySupport,
}: NetworkingTableProps & {
  availabilityZoneSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  mtuSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  vlanTransparencySupport: OpenStackFeatureSupport;
}) {
  const networks = useSuspenseQuery(
    projectNetworksQueryOptions(regionId, projectId, tagFilter),
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
            href={`/networking/networks/${row.original.id}`}
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
      ...(vlanTransparencySupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "vlan_transparent",
              header: "VLAN transparent",
              cell: ({ row }: { row: { original: Network } }) =>
                row.original.vlan_transparent == null
                  ? "Not reported"
                  : row.original.vlan_transparent
                    ? "Enabled"
                    : "Disabled",
              meta: { fieldType: "boolean", visible: false },
            } satisfies ColumnDef<Network>,
          ]),
      ...(dnsIntegrationSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "dns_domain",
              header: "DNS domain",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Network>,
          ]),
      ...(portSecuritySupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "port_security_enabled",
              header: "Port security",
              cell: ({ row }: { row: { original: Network } }) =>
                row.original.port_security_enabled ? "Enabled" : "Disabled",
              meta: { fieldType: "boolean", visible: false },
            } satisfies ColumnDef<Network>,
          ]),
      ...(qosSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "qos_policy_id",
              header: "QoS policy ID",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Network>,
          ]),
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: false },
      },
      ...(tagSupport.status === "unsupported"
        ? []
        : [neutronTagColumn<Network>("network", tagSupport)]),
    ],
    [
      dnsIntegrationSupport.status,
      portSecuritySupport.status,
      qosSupport.status,
      subnetById,
      tagSupport,
      vlanTransparencySupport.status,
    ],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateNetworkAction
            projectId={projectId}
            regionId={regionId}
            initiallyOpen={initiallyOpen}
            availabilityZoneSupport={availabilityZoneSupport}
            dnsIntegrationSupport={dnsIntegrationSupport}
            mtuSupport={mtuSupport}
            portSecuritySupport={portSecuritySupport}
            qosSupport={qosSupport}
            vlanTransparencySupport={vlanTransparencySupport}
          />
        }
      >
        Project-owned layer 2 networks and their address spaces.
      </TableIntro>
      <DataTable
        additionalFilters={
          <NeutronTagFilterControl
            filter={tagFilter}
            initialError={tagFilterError}
            support={tagSupport}
          />
        }
        columns={columns}
        data={networks.data}
        emptyIcon={NetworkIcon}
        forceVisibleColumnIds={
          tagFilter ? TAG_FILTER_VISIBLE_COLUMNS : undefined
        }
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
  availabilityZoneSupport,
  canManageAdminOnlyRouterSettings,
  defaultRouteBfdSupport,
  defaultRouteEcmpSupport,
  projectId,
  regionId,
  initiallyOpen = false,
  tagFilter,
  tagFilterError,
  tagSupport,
}: NetworkingTableProps & {
  availabilityZoneSupport: OpenStackFeatureSupport;
  canManageAdminOnlyRouterSettings: boolean;
  defaultRouteBfdSupport: OpenStackFeatureSupport;
  defaultRouteEcmpSupport: OpenStackFeatureSupport;
}) {
  const routers = useSuspenseQuery(
    routersQueryOptions(regionId, projectId, tagFilter),
  );
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
            href={`/networking/routers/${row.original.id}`}
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
        accessorFn: (router) => {
          const gateways = routerExternalGateways(router);
          const primary = gateways[0];
          return primary
            ? `${externalById.get(primary.network_id)?.name ?? primary.network_id} ${gateways.length}`
            : "";
        },
        header: "External gateway",
        cell: ({ row }) => {
          const gateways = routerExternalGateways(row.original);
          const primary = gateways[0];
          if (!primary)
            return <span className="text-muted-foreground">Not connected</span>;
          const gatewayNetwork = externalById.get(primary.network_id);
          return (
            <span className="flex flex-wrap items-center gap-2">
              <ResourceLink
                href={`/networking/networks/${encodeURIComponent(primary.network_id)}`}
              >
                {gatewayNetwork?.name || primary.network_id}
              </ResourceLink>
              {gateways.length > 1 ? (
                <Badge variant="outline">+{gateways.length - 1}</Badge>
              ) : null}
            </span>
          );
        },
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "snat",
        accessorFn: (router) =>
          Boolean(routerExternalGateways(router)[0]?.enable_snat),
        header: "SNAT",
        cell: ({ row }) =>
          routerExternalGateways(row.original)[0]?.enable_snat
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
      ...(tagSupport.status === "unsupported"
        ? []
        : [neutronTagColumn<Router>("router", tagSupport)]),
    ],
    [externalById, tagSupport],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateRouterAction
            projectId={projectId}
            regionId={regionId}
            initiallyOpen={initiallyOpen}
            availabilityZoneSupport={availabilityZoneSupport}
            canManageAdminOnlyRouterSettings={canManageAdminOnlyRouterSettings}
            defaultRouteBfdSupport={defaultRouteBfdSupport}
            defaultRouteEcmpSupport={defaultRouteEcmpSupport}
          />
        }
      >
        Layer 3 routing, subnet interfaces, and external gateways.
      </TableIntro>
      <DataTable
        additionalFilters={
          <NeutronTagFilterControl
            filter={tagFilter}
            initialError={tagFilterError}
            support={tagSupport}
          />
        }
        columns={columns}
        data={routers.data}
        emptyIcon={RouterIcon}
        forceVisibleColumnIds={
          tagFilter ? TAG_FILTER_VISIBLE_COLUMNS : undefined
        }
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
  allowedAddressPairsSupport,
  dnsDomainPortsSupport,
  dnsIntegrationSupport,
  extraDhcpOptionsSupport,
  hardwareOffloadSupport,
  projectId,
  regionId,
  initiallyOpen = false,
  numaAffinitySupport,
  numaSocketSupport,
  portBindingSupport,
  portSecuritySupport,
  qosNetworkPolicySupport,
  qosSupport,
  rejectMulticastAddressPairs,
  securityGroupSupport,
  tagFilter,
  tagFilterError,
  tagSupport,
  trustedVifSupport,
  uplinkStatusPropagationSupport,
}: NetworkingTableProps & {
  allowedAddressPairsSupport: OpenStackFeatureSupport;
  dnsDomainPortsSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  extraDhcpOptionsSupport: OpenStackFeatureSupport;
  hardwareOffloadSupport: OpenStackFeatureSupport;
  numaAffinitySupport: OpenStackFeatureSupport;
  numaSocketSupport: OpenStackFeatureSupport;
  portBindingSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosNetworkPolicySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  rejectMulticastAddressPairs: boolean;
  securityGroupSupport: OpenStackFeatureSupport;
  trustedVifSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationSupport: OpenStackFeatureSupport;
}) {
  const ports = useSuspenseQuery(
    portsQueryOptions(regionId, projectId, tagFilter),
  );
  const networks = useSuspenseQuery(networksQueryOptions(regionId, projectId));
  const networkById = useMemo(
    () => new Map(networks.data.map((network) => [network.id, network])),
    [networks.data],
  );
  const showUplinkStatusPropagation =
    uplinkStatusPropagationSupport.status !== "unsupported" ||
    ports.data.some((port) => port.propagate_uplink_status !== undefined);
  const showPortBinding =
    portBindingSupport.status !== "unsupported" ||
    ports.data.some((port) => port["binding:vnic_type"] !== undefined);
  const showHardwareOffload =
    hardwareOffloadSupport.status !== "unsupported" ||
    ports.data.some((port) => Boolean(port.hardware_offload_type));
  const showNumaAffinity =
    numaAffinitySupport.status !== "unsupported" ||
    ports.data.some((port) => port.numa_affinity_policy != null);
  const showTrustedVif =
    trustedVifSupport.status !== "unsupported" ||
    ports.data.some((port) => port.trusted != null);
  const columns = useMemo<ColumnDef<Port>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/networking/ports/${row.original.id}`}
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
            href={`/networking/networks/${encodeURIComponent(row.original.network_id)}`}
          >
            {networkById.get(row.original.network_id)?.name ||
              row.original.network_id}
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
      ...(showPortBinding
        ? [
            {
              id: "binding_vnic_type",
              accessorFn: (port) => port["binding:vnic_type"],
              header: "vNIC type",
              cell: ({ row }: { row: { original: Port } }) =>
                neutronPortVnicTypeLabel(row.original["binding:vnic_type"]),
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]
        : []),
      ...(showNumaAffinity
        ? [
            {
              id: "numa_affinity_policy",
              accessorFn: (port) => port.numa_affinity_policy,
              header: "NUMA affinity",
              cell: ({ row }: { row: { original: Port } }) =>
                neutronPortNumaAffinityPolicyLabel(
                  row.original.numa_affinity_policy,
                ),
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]
        : []),
      ...(showHardwareOffload
        ? [
            {
              id: "hardware_offload_type",
              accessorFn: (port) => port.hardware_offload_type,
              header: "Hardware offload",
              cell: ({ row }: { row: { original: Port } }) =>
                neutronPortHardwareOffloadTypeLabel(
                  row.original.hardware_offload_type,
                ),
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]
        : []),
      ...(showTrustedVif
        ? [
            {
              id: "trusted",
              accessorFn: (port) => port.trusted,
              header: "Trusted VIF",
              cell: ({ row }: { row: { original: Port } }) =>
                row.original.trusted == null
                  ? "Not reported"
                  : row.original.trusted
                    ? "Trusted"
                    : "Not trusted",
              meta: { fieldType: "boolean", visible: false },
            } satisfies ColumnDef<Port>,
          ]
        : []),
      ...(dnsIntegrationSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "dns_name",
              header: "DNS name",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]),
      ...(dnsDomainPortsSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "dns_domain",
              header: "DNS domain",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]),
      ...(qosSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "qos_policy_id",
              header: "Direct QoS policy ID",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]),
      ...(qosNetworkPolicySupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "qos_network_policy_id",
              header: "Network QoS policy ID",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<Port>,
          ]),
      ...(showUplinkStatusPropagation
        ? [
            {
              id: "propagate_uplink_status",
              accessorFn: (port) => port.propagate_uplink_status,
              header: "Uplink status propagation",
              cell: ({ row }) =>
                row.original.propagate_uplink_status === undefined
                  ? "Not reported"
                  : row.original.propagate_uplink_status
                    ? "Enabled"
                    : "Disabled",
              meta: { fieldType: "boolean", visible: false },
            } satisfies ColumnDef<Port>,
          ]
        : []),
      ...(tagSupport.status === "unsupported"
        ? []
        : [neutronTagColumn<Port>("port", tagSupport)]),
    ],
    [
      dnsDomainPortsSupport.status,
      dnsIntegrationSupport.status,
      networkById,
      qosNetworkPolicySupport.status,
      qosSupport.status,
      showHardwareOffload,
      showNumaAffinity,
      showPortBinding,
      tagSupport,
      showTrustedVif,
      showUplinkStatusPropagation,
    ],
  );

  return (
    <>
      <TableIntro
        action={
          <CreatePortAction
            allowedAddressPairsSupport={allowedAddressPairsSupport}
            dnsDomainPortsSupport={dnsDomainPortsSupport}
            dnsIntegrationSupport={dnsIntegrationSupport}
            extraDhcpOptionsSupport={extraDhcpOptionsSupport}
            hardwareOffloadSupport={hardwareOffloadSupport}
            projectId={projectId}
            regionId={regionId}
            initiallyOpen={initiallyOpen}
            numaAffinitySupport={numaAffinitySupport}
            numaSocketSupport={numaSocketSupport}
            portBindingSupport={portBindingSupport}
            portSecuritySupport={portSecuritySupport}
            qosSupport={qosSupport}
            rejectMulticastAddressPairs={rejectMulticastAddressPairs}
            securityGroupSupport={securityGroupSupport}
            trustedVifSupport={trustedVifSupport}
            uplinkStatusPropagationSupport={uplinkStatusPropagationSupport}
          />
        }
      >
        Virtual interfaces connecting project resources to networks.
      </TableIntro>
      <DataTable
        additionalFilters={
          <NeutronTagFilterControl
            filter={tagFilter}
            initialError={tagFilterError}
            support={tagSupport}
          />
        }
        columns={columns}
        data={ports.data}
        emptyIcon={EthernetPort}
        forceVisibleColumnIds={
          tagFilter ? TAG_FILTER_VISIBLE_COLUMNS : undefined
        }
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
  dnsIntegrationSupport,
  projectId,
  regionId,
  initiallyOpen = false,
  qosNetworkPolicySupport,
  qosSupport,
  tagFilter,
  tagFilterError,
  tagSupport,
}: NetworkingTableProps & {
  dnsIntegrationSupport: OpenStackFeatureSupport;
  qosNetworkPolicySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
}) {
  const floatingIps = useSuspenseQuery(
    floatingIpsQueryOptions(regionId, projectId, tagFilter),
  );
  const columns = useMemo<ColumnDef<FloatingIp>[]>(
    () => [
      {
        accessorKey: "floating_ip_address",
        header: "Floating IP",
        cell: ({ row }) => (
          <NameLink
            href={`/networking/floating-ips/${row.original.id}`}
            name={row.original.floating_ip_address}
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
        accessorKey: "fixed_ip_address",
        header: "Fixed IP",
        cell: ({ row }) =>
          row.original.fixed_ip_address && row.original.port_id ? (
            <ResourceLink
              href={`/networking/ports/${encodeURIComponent(row.original.port_id)}`}
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
              href={`/networking/ports/${encodeURIComponent(row.original.port_id)}`}
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
      ...(dnsIntegrationSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "dns_name",
              header: "DNS name",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<FloatingIp>,
            {
              accessorKey: "dns_domain",
              header: "DNS domain",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<FloatingIp>,
          ]),
      ...(qosSupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "qos_policy_id",
              header: "Direct QoS policy ID",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<FloatingIp>,
          ]),
      ...(qosNetworkPolicySupport.status === "unsupported"
        ? []
        : [
            {
              accessorKey: "qos_network_policy_id",
              header: "Network QoS policy ID",
              meta: { fieldType: "string", visible: false },
            } satisfies ColumnDef<FloatingIp>,
          ]),
      ...(tagSupport.status === "unsupported"
        ? []
        : [neutronTagColumn<FloatingIp>("floating-ip", tagSupport)]),
    ],
    [
      dnsIntegrationSupport.status,
      qosNetworkPolicySupport.status,
      qosSupport.status,
      tagSupport,
    ],
  );

  return (
    <>
      <TableIntro
        action={
          <AllocateFloatingIpAction
            dnsIntegrationSupport={dnsIntegrationSupport}
            projectId={projectId}
            regionId={regionId}
            initiallyOpen={initiallyOpen}
            qosSupport={qosSupport}
          />
        }
      >
        Public addresses allocated to the active project.
      </TableIntro>
      <DataTable
        additionalFilters={
          <NeutronTagFilterControl
            filter={tagFilter}
            initialError={tagFilterError}
            support={tagSupport}
          />
        }
        columns={columns}
        data={floatingIps.data}
        emptyIcon={Globe2}
        forceVisibleColumnIds={
          tagFilter ? TAG_FILTER_VISIBLE_COLUMNS : undefined
        }
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
  initiallyOpen = false,
  statefulSupport,
  tagFilter,
  tagFilterError,
  tagSupport,
}: NetworkingTableProps & { statefulSupport: OpenStackFeatureSupport }) {
  const groups = useSuspenseQuery(
    securityGroupsQueryOptions(regionId, projectId, tagFilter),
  );
  const hasReportedStateful = groups.data.some(
    (group) => group.stateful !== undefined,
  );
  const columns = useMemo<ColumnDef<SecurityGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <NameLink
            href={`/networking/security-groups/${row.original.id}`}
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
      ...(statefulSupport.status === "unsupported" && !hasReportedStateful
        ? []
        : [
            {
              id: "stateful",
              accessorFn: (group: SecurityGroup) =>
                group.stateful === undefined
                  ? "Not reported"
                  : group.stateful
                    ? "Stateful"
                    : "Stateless",
              header: "Connection tracking",
              meta: { fieldType: "string" as const, visible: true },
            },
          ]),
      {
        accessorKey: "created_at",
        header: "Age",
        meta: { fieldType: "date", dateDisplay: "age", visible: false },
      },
      ...(tagSupport.status === "unsupported"
        ? []
        : [neutronTagColumn<SecurityGroup>("security-group", tagSupport)]),
    ],
    [hasReportedStateful, statefulSupport.status, tagSupport],
  );

  return (
    <>
      <TableIntro
        action={
          <CreateSecurityGroupAction
            projectId={projectId}
            regionId={regionId}
            initiallyOpen={initiallyOpen}
            statefulSupport={statefulSupport}
          />
        }
      >
        Ingress and egress policy applied to project ports.
      </TableIntro>
      <DataTable
        additionalFilters={
          <NeutronTagFilterControl
            filter={tagFilter}
            initialError={tagFilterError}
            support={tagSupport}
          />
        }
        columns={columns}
        data={groups.data}
        emptyIcon={ShieldCheck}
        forceVisibleColumnIds={
          tagFilter ? TAG_FILTER_VISIBLE_COLUMNS : undefined
        }
        isRefetching={groups.isRefetching}
        refetch={() => {
          void groups.refetch();
        }}
        resourceName="security group"
      />
    </>
  );
}
