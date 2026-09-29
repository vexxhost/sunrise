"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Share2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { shareNetworksQueryOptions } from "@/hooks/queries/useManila";
import type { ManilaShareNetwork } from "@/types/openstack";

const columns: ColumnDef<ManilaShareNetwork>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <ResourceLink
        href={`/shared-file-systems/share-networks/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed share network"}
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
      idLinkPath: "/shared-file-systems/share-networks",
    },
  },
  {
    id: "subnets",
    accessorFn: (network) => network.share_network_subnets?.length ?? 0,
    header: "Subnets",
    meta: { fieldType: "number", visible: true },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => row.original.description || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
];

export function ShareNetworksClient({
  projectId,
  regionId,
}: {
  projectId?: string;
  regionId?: string;
}) {
  const query = useMemo(
    () => shareNetworksQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(query);

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyIcon={Share2}
      isRefetching={isRefetching}
      refetch={refetch}
      resourceName="share network"
    />
  );
}
