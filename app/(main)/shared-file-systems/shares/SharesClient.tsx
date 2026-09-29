"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderTree, Pencil, Scaling, Trash2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  ShareMutationDialog,
  type ShareMutationKind,
} from "@/components/SharedFileSystem/ShareMutationDialog";
import { Badge } from "@/components/ui/badge";
import { sharesQueryOptions } from "@/hooks/queries/useManila";
import {
  canDeleteShare,
  canEditShare,
  canResizeShare,
  formatManilaStatus,
  isShareTransitioning,
  shareStatusVariant,
} from "@/lib/openstack/manila-lifecycle";
import type { ManilaShare } from "@/types/openstack";

const columns: ColumnDef<ManilaShare>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <ResourceLink
        href={`/shared-file-systems/shares/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed share"}
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
      idLinkPath: "/shared-file-systems/shares",
    },
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }) => `${row.original.size} GiB`,
    meta: { fieldType: "number", visible: true },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      isShareTransitioning(row.original) ? (
        <ProgressStatusBadge label={formatManilaStatus(row.original.status)} />
      ) : (
        <Badge variant={shareStatusVariant(row.original.status)}>
          {formatManilaStatus(row.original.status)}
        </Badge>
      ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "share_proto",
    header: "Protocol",
    meta: { fieldType: "string", visible: true },
  },
  {
    id: "share_type",
    accessorFn: (share) => share.share_type_name || share.share_type,
    header: "Share Type",
    cell: ({ row }) =>
      row.original.share_type_name || row.original.share_type || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "share_network_id",
    header: "Share Network",
    cell: ({ row }) =>
      row.original.share_network_id ? (
        <ResourceLink
          href={`/shared-file-systems/share-networks/${encodeURIComponent(row.original.share_network_id)}`}
          className="font-mono text-xs"
        >
          {row.original.share_network_id}
        </ResourceLink>
      ) : (
        "-"
      ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "availability_zone",
    header: "Availability Zone",
    cell: ({ row }) => row.original.availability_zone || "-",
    meta: { fieldType: "string", visible: false },
  },
  {
    accessorKey: "is_public",
    header: "Visibility",
    cell: ({ row }) => (row.original.is_public ? "Public" : "Project only"),
    meta: { fieldType: "boolean", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
];

export function SharesClient({
  projectId,
  regionId,
}: {
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const listQuery = useMemo(
    () => sharesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery({
    ...listQuery,
    refetchInterval: ({ state }) =>
      state.data?.some(isShareTransitioning) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<ShareMutationKind | null>(null);
  const [target, setTarget] = useState<ManilaShare | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const openAction = useCallback(
    (nextAction: ShareMutationKind, shares: ManilaShare[]) => {
      setTarget(shares[0] ?? null);
      setAction(nextAction);
    },
    [],
  );
  const closeAction = useCallback(() => {
    setAction(null);
    setTarget(null);
  }, []);
  const refreshAfterAction = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listQuery.queryKey });
    if (target) {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share", target.id],
      });
    }
  }, [listQuery.queryKey, projectId, queryClient, regionId, target]);
  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: ManilaShare[]) => openAction("edit", rows),
        isDisabled: (rows: ManilaShare[]) =>
          rows.length !== 1 || !canEditShare(rows[0]),
      },
      {
        label: "Resize",
        icon: Scaling,
        onClick: (rows: ManilaShare[]) => openAction("resize", rows),
        isDisabled: (rows: ManilaShare[]) =>
          rows.length !== 1 || !canResizeShare(rows[0]),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: ManilaShare[]) => openAction("delete", rows),
        isDisabled: (rows: ManilaShare[]) =>
          rows.length !== 1 || !canDeleteShare(rows[0]),
      },
    ],
    [openAction],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={FolderTree}
        getRowId={(share) => share.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="share"
        rowActions={rowActions}
      />
      {action && target && scope ? (
        <ShareMutationDialog
          key={`${action}-${target.id}`}
          action={action}
          onComplete={refreshAfterAction}
          onOpenChange={closeAction}
          scope={scope}
          share={target}
        />
      ) : null}
    </>
  );
}
