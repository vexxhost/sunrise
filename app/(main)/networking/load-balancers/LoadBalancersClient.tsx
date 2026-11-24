"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2, Waypoints } from "lucide-react";

import { LoadBalancerCreateAction } from "@/components/LoadBalancer/LoadBalancerCreateAction";
import {
  LoadBalancerMutationDialog,
  type LoadBalancerMutationKind,
} from "@/components/LoadBalancer/LoadBalancerMutationDialog";
import { OctaviaTagList } from "@/components/LoadBalancer/OctaviaTags";
import { DataTable } from "@/components/DataTable";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  loadBalancerDetailsQueryOptions,
  loadBalancersQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  canDeleteLoadBalancer,
  canUpdateLoadBalancer,
  formatOctaviaStatus,
  isOctaviaProvisioning,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import type { OctaviaLoadBalancer } from "@/types/openstack";

const baseColumns: ColumnDef<OctaviaLoadBalancer>[] = [
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
  const queryClient = useQueryClient();
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
  const [action, setAction] = useState<LoadBalancerMutationKind | null>(null);
  const [target, setTarget] = useState<OctaviaLoadBalancer | null>(null);
  const openAction = useCallback(
    (
      nextAction: LoadBalancerMutationKind,
      loadBalancers: OctaviaLoadBalancer[],
    ) => {
      setTarget(loadBalancers[0] ?? null);
      setAction(nextAction);
    },
    [],
  );
  const closeAction = useCallback(() => {
    setAction(null);
    setTarget(null);
  }, []);
  const columns = useMemo<ColumnDef<OctaviaLoadBalancer>[]>(
    () => [
      ...baseColumns,
      ...(tagSupport.status !== "unsupported"
        ? [
            {
              id: "tags",
              accessorFn: (loadBalancer: OctaviaLoadBalancer) =>
                (loadBalancer.tags ?? []).join("\n"),
              header: "Tags",
              cell: ({ row }: { row: { original: OctaviaLoadBalancer } }) => (
                <OctaviaTagList tags={row.original.tags} />
              ),
              meta: { fieldType: "string" as const, visible: false },
            },
          ]
        : []),
      {
        id: "actions",
        header: "Actions",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <EditActionButton
              compact
              disabled={!canUpdateLoadBalancer(row.original)}
              label={`Edit ${row.original.name || row.original.id}`}
              onClick={() => openAction("edit", [row.original])}
            />
            <Button
              aria-label={`Delete ${row.original.name || row.original.id}`}
              disabled={isOctaviaProvisioning(row.original)}
              onClick={() => openAction("delete", [row.original])}
              size="icon-sm"
              title={`Delete ${row.original.name || row.original.id}`}
              tone="danger"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
        meta: { fieldType: "string", visible: true },
      },
    ],
    [openAction, tagSupport.status],
  );
  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: OctaviaLoadBalancer[]) => openAction("edit", rows),
        isDisabled: (rows: OctaviaLoadBalancer[]) =>
          rows.length !== 1 || !canUpdateLoadBalancer(rows[0]),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: OctaviaLoadBalancer[]) => openAction("delete", rows),
        isDisabled: (rows: OctaviaLoadBalancer[]) =>
          rows.length !== 1 || !canDeleteLoadBalancer(rows[0]),
      },
    ],
    [openAction],
  );
  const refreshAfterAction = useCallback(
    async (deleted: boolean) => {
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
      if (target) {
        await queryClient.invalidateQueries({
          queryKey: loadBalancerDetailsQueryOptions(
            regionId,
            projectId,
            target.id,
          ).queryKey,
          refetchType: deleted ? "none" : "active",
        });
      }
    },
    [projectId, query.queryKey, queryClient, regionId, target],
  );

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
        rowActions={rowActions}
      />
      {action && target ? (
        <LoadBalancerMutationDialog
          action={action}
          key={`${action}-${target.id}`}
          loadBalancer={target}
          onComplete={refreshAfterAction}
          onOpenChange={closeAction}
          scope={{ projectId, regionId }}
          tagSupport={tagSupport}
        />
      ) : null}
    </>
  );
}
