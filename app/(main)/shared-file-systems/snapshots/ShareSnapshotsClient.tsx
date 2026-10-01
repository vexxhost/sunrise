"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Camera, Pencil, Trash2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  ShareSnapshotMutationDialog,
  type ShareSnapshotMutationKind,
} from "@/components/SharedFileSystem/ShareSnapshotMutationDialog";
import { Badge } from "@/components/ui/badge";
import { shareSnapshotsQueryOptions } from "@/hooks/queries/useManila";
import {
  canDeleteShareSnapshot,
  canEditShareSnapshot,
  formatManilaStatus,
  isShareSnapshotTransitioning,
  shareStatusVariant,
} from "@/lib/openstack/manila-lifecycle";
import type { ManilaShareSnapshot } from "@/types/openstack";

const columns: ColumnDef<ManilaShareSnapshot>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <ResourceLink
        href={`/shared-file-systems/snapshots/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed snapshot"}
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
      idLinkPath: "/shared-file-systems/snapshots",
    },
  },
  {
    accessorKey: "share_id",
    header: "Source Share",
    cell: ({ row }) => (
      <ResourceLink
        href={`/shared-file-systems/shares/${encodeURIComponent(row.original.share_id)}`}
        className="font-mono text-xs"
      >
        {row.original.share_name || row.original.share_id}
      </ResourceLink>
    ),
    meta: { fieldType: "string", visible: true },
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
      isShareSnapshotTransitioning(row.original) ? (
        <ProgressStatusBadge label={formatManilaStatus(row.original.status)} />
      ) : (
        <Badge variant={shareStatusVariant(row.original.status)}>
          {formatManilaStatus(row.original.status)}
        </Badge>
      ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
];

export function ShareSnapshotsClient({
  projectId,
  regionId,
}: {
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const listQuery = useMemo(
    () => shareSnapshotsQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery({
    ...listQuery,
    refetchInterval: ({ state }) =>
      state.data?.some(isShareSnapshotTransitioning) ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<ShareSnapshotMutationKind | null>(null);
  const [target, setTarget] = useState<ManilaShareSnapshot | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const openAction = useCallback(
    (
      nextAction: ShareSnapshotMutationKind,
      snapshots: ManilaShareSnapshot[],
    ) => {
      setTarget(snapshots[0] ?? null);
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
        queryKey: [regionId, projectId, "manila", "share-snapshot", target.id],
      });
    }
  }, [listQuery.queryKey, projectId, queryClient, regionId, target]);
  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: ManilaShareSnapshot[]) => openAction("edit", rows),
        isDisabled: (rows: ManilaShareSnapshot[]) =>
          rows.length !== 1 || !canEditShareSnapshot(rows[0]),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: ManilaShareSnapshot[]) => openAction("delete", rows),
        isDisabled: (rows: ManilaShareSnapshot[]) =>
          rows.length !== 1 || !canDeleteShareSnapshot(rows[0]),
      },
    ],
    [openAction],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={Camera}
        getRowId={(snapshot) => snapshot.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="share snapshot"
        rowActions={rowActions}
      />
      {action && target && scope ? (
        <ShareSnapshotMutationDialog
          key={`${action}-${target.id}`}
          action={action}
          onComplete={refreshAfterAction}
          onOpenChange={closeAction}
          scope={scope}
          snapshot={target}
        />
      ) : null}
    </>
  );
}
