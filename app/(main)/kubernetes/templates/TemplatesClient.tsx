"use client";

import type { ComponentType } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Cloud, Network, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { cn } from "@/lib/utils";
import type { MagnumClusterTemplate } from "@/types/openstack";

interface TemplatesClientProps {
  regionId?: string;
  projectId?: string;
}

function uniqueValues(
  templates: MagnumClusterTemplate[],
  accessor: (template: MagnumClusterTemplate) => string | undefined,
) {
  return new Set(
    templates
      .map((template) => accessor(template))
      .filter((value): value is string => Boolean(value)),
  ).size;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function FadedTableText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const displayValue = value || "-";
  const spacerValue = displayValue.slice(0, 16);

  return (
    <span
      className={cn(
        "group/faded relative block w-full min-w-0 flex-shrink-0",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 z-10 block w-full overflow-hidden whitespace-nowrap",
          "[mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)]",
          "group-hover/faded:left-[-9px] group-hover/faded:top-[-5px] group-hover/faded:z-50 group-hover/faded:w-auto group-hover/faded:max-w-[min(80vw,48rem)]",
          "group-hover/faded:overflow-visible group-hover/faded:rounded-md group-hover/faded:border group-hover/faded:border-border group-hover/faded:bg-popover",
          "group-hover/faded:px-2 group-hover/faded:py-1 group-hover/faded:text-popover-foreground group-hover/faded:underline",
          "group-hover/faded:[mask-image:none] group-hover/faded:[-webkit-mask-image:none]",
        )}
      >
        {displayValue}
      </span>
      <span className="invisible block whitespace-nowrap">{spacerValue}</span>
    </span>
  );
}

const columns: ColumnDef<MagnumClusterTemplate>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <FadedTableText
        value={row.original.name || row.original.uuid}
        className="w-64"
      />
    ),
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "uuid",
    header: "UUID",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <FadedTableText value={row.original.uuid} className="w-56 font-mono" />
    ),
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "image_id",
    header: "Image",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <FadedTableText
        value={row.original.image_id || "-"}
        className="w-72 font-mono"
      />
    ),
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "flavor_id",
    header: "Worker Node Flavor",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.flavor_id || "-",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "master_flavor_id",
    header: "Control Node Flavor",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.master_flavor_id || "-",
    meta: {
      fieldType: "string",
      visible: false,
    },
  },
  {
    accessorKey: "network_driver",
    header: "Network Driver",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.network_driver || "-",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "public",
    header: "Visibility",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <Badge variant={row.original.public ? "default" : "secondary"}>
        {row.original.public ? "Public" : "Private"}
      </Badge>
    ),
    meta: {
      fieldType: "boolean",
      visible: true,
    },
  },
  {
    accessorKey: "floating_ip_enabled",
    header: "Floating IP",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.floating_ip_enabled ? "Enabled" : "Disabled",
    meta: {
      fieldType: "boolean",
      visible: true,
    },
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    meta: {
      fieldType: "date",
      visible: false,
    },
  },
];

export function TemplatesClient({ regionId, projectId }: TemplatesClientProps) {
  const { data, isRefetching, refetch } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );
  const publicTemplates = data.filter((template) => template.public).length;
  const privateTemplates = data.length - publicTemplates;
  const networkDrivers = uniqueValues(
    data,
    (template) => template.network_driver,
  );
  const floatingIpTemplates = data.filter(
    (template) => template.floating_ip_enabled,
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          icon={Settings}
          label="Templates"
          value={String(data.length)}
          detail={`${publicTemplates} public / ${privateTemplates} private`}
        />
        <SummaryTile
          icon={Network}
          label="Network drivers"
          value={String(networkDrivers)}
          detail="Pod network drivers"
        />
        <SummaryTile
          icon={Cloud}
          label="Floating IP"
          value={String(floatingIpTemplates)}
          detail="Enabled external API access"
        />
      </div>

      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="cluster template"
        emptyIcon={Settings}
      />
    </div>
  );
}
