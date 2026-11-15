"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Share2, Trash2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { ShareNetworkDeleteDialog } from "@/components/SharedFileSystem/ShareNetworkLifecycleDialogs";
import { ShareNetworkMutationDialog } from "@/components/SharedFileSystem/ShareNetworkMutationDialog";
import { shareNetworksQueryOptions } from "@/hooks/queries/useManila";
import type { ManilaShareNetwork } from "@/types/openstack";

type ShareNetworkAction = "edit" | "delete";

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
  const [action, setAction] = useState<ShareNetworkAction | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const refreshAfterMutation = useCallback(async () => {
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
        onClick: (rows: ManilaShareNetwork[]) => {
          setTarget(rows[0] ?? null);
          setAction("edit");
        },
        isDisabled: (rows: ManilaShareNetwork[]) => rows.length !== 1,
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: ManilaShareNetwork[]) => {
          setTarget(rows[0] ?? null);
          setAction("delete");
        },
        isDisabled: (rows: ManilaShareNetwork[]) => rows.length !== 1,
      },
    ],
    [],
  );
  const closeDialog = () => {
    setTarget(null);
    setAction(null);
  };

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
      {target && action === "edit" && scope ? (
        <ShareNetworkMutationDialog
          key={`${target.id}:edit`}
          network={target}
          onComplete={refreshAfterMutation}
          onOpenChange={closeDialog}
          scope={scope}
        />
      ) : null}
      {target && action === "delete" && scope ? (
        <ShareNetworkDeleteDialog
          key={`${target.id}:delete`}
          network={target}
          onComplete={refreshAfterMutation}
          onOpenChange={closeDialog}
          scope={scope}
        />
      ) : null}
    </>
  );
}
