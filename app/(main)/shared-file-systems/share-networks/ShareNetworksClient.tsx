"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Share2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { ShareNetworkMutationDialog } from "@/components/SharedFileSystem/ShareNetworkMutationDialog";
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
  const queryClient = useQueryClient();
  const query = useMemo(
    () => shareNetworksQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(query);
  const [target, setTarget] = useState<ManilaShareNetwork | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const refreshAfterEdit = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: query.queryKey });
    if (target) {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share-network", target.id],
      });
    }
  }, [projectId, query.queryKey, queryClient, regionId, target]);
  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: ManilaShareNetwork[]) => setTarget(rows[0] ?? null),
        isDisabled: (rows: ManilaShareNetwork[]) => rows.length !== 1,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={Share2}
        getRowId={(network) => network.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="share network"
        rowActions={rowActions}
      />
      {target && scope ? (
        <ShareNetworkMutationDialog
          key={target.id}
          network={target}
          onComplete={refreshAfterEdit}
          onOpenChange={() => setTarget(null)}
          scope={scope}
        />
      ) : null}
    </>
  );
}
