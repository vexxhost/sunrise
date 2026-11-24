"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Waypoints } from "lucide-react";

import { LoadBalancerCreateAction } from "@/components/LoadBalancer/LoadBalancerCreateAction";
import { DataTable } from "@/components/DataTable";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { loadBalancersQueryOptions } from "@/hooks/queries/useLoadBalancers";
import {
  formatOctaviaStatus,
  isOctaviaProvisioning,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import type { OctaviaLoadBalancer } from "@/types/openstack";

const columns: ColumnDef<OctaviaLoadBalancer>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <ResourceLink
        href={`/networking/load-balancers/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed load balancer"}
      </ResourceLink>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "id",
    header: "ID",
    meta: {
      fieldType: "string",
      visible: true,
      idLinkPath: "/networking/load-balancers",
    },
  },
  {
    accessorKey: "vip_address",
    header: "VIP Address",
    cell: ({ row }) => row.original.vip_address || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "operating_status",
    header: "Operating Status",
    cell: ({ row }) => (
      <Badge variant={octaviaStatusVariant(row.original.operating_status)}>
        {formatOctaviaStatus(row.original.operating_status)}
      </Badge>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "provisioning_status",
    header: "Provisioning Status",
    cell: ({ row }) =>
      isOctaviaProvisioning(row.original) ? (
        <ProgressStatusBadge
          label={formatOctaviaStatus(row.original.provisioning_status)}
        />
      ) : (
        <Badge variant={octaviaStatusVariant(row.original.provisioning_status)}>
          {formatOctaviaStatus(row.original.provisioning_status)}
        </Badge>
      ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "availability_zone",
    header: "Availability Zone",
    cell: ({ row }) => row.original.availability_zone || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "provider",
    header: "Provider",
    cell: ({ row }) => row.original.provider || "-",
    meta: { fieldType: "string", visible: false },
  },
  {
    accessorKey: "admin_state_up",
    header: "Admin State",
    cell: ({ row }) => (row.original.admin_state_up ? "Up" : "Down"),
    meta: { fieldType: "boolean", visible: false },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
];

export function LoadBalancersClient({
  availabilityZoneSupport,
  initiallyOpen,
  projectId,
  regionId,
  tagSupport,
}: {
  availabilityZoneSupport: OpenStackFeatureSupport;
  initiallyOpen: boolean;
  projectId: string;
  regionId: string;
  tagSupport: OpenStackFeatureSupport;
}) {
  const query = useMemo(
    () => loadBalancersQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      state.data?.some(isOctaviaProvisioning) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Octavia virtual IPs and their listener, pool, member, and health
          topology.
        </p>
        <LoadBalancerCreateAction
          availabilityZoneSupport={availabilityZoneSupport}
          initiallyOpen={initiallyOpen}
          projectId={projectId}
          regionId={regionId}
          tagSupport={tagSupport}
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={Waypoints}
        getRowId={(loadBalancer) => loadBalancer.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="load balancer"
      />
    </>
  );
}
