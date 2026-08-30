'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Camera, Trash2 } from "lucide-react";
import { snapshotQueryOptions, snapshotsQueryOptions } from "@/hooks/queries/useVolumes";
import { Badge } from "@/components/ui/badge";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Snapshot } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { SnapshotDeleteDialog } from "@/components/Volume/SnapshotDeleteDialog";
import {
  canDeleteSnapshot,
  isSnapshotTransitioning,
  mergeSnapshotUpdates,
} from "@/lib/openstack/storage-lifecycle";
import { formatSnapshotStatus } from "@/lib/openstack/storage-status";
import { collectTransitionUpdates } from "@/lib/openstack/transition-poll";
import { ResourceLink } from "@/components/resources/ResourceLink";

const TRANSITION_REFETCH_INTERVAL_MS = 5_000;

const columns: ColumnDef<Snapshot>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Snapshot } }) => (
      <ResourceLink
        href={`/compute/snapshots/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed snapshot"}
      </ResourceLink>
    ),
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "id",
    header: "ID",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.description || "-",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "volume_id",
    header: "Volume",
    meta: {
      monospace: true,
      fieldType: "string",
      visible: true
    },
    cell: ({ row }: { row: { original: Snapshot } }) => (
      <ResourceLink
        href={`/compute/volumes/${encodeURIComponent(row.original.volume_id)}`}
        className="font-mono text-xs"
      >
        {row.original.volume_id}
      </ResourceLink>
    )
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.size + " GB",
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Snapshot } }) => {
      const status = formatSnapshotStatus(row.original.status);
      const transitioning = isSnapshotTransitioning(row.original);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (status) {
        case "Available":
          variant = "secondary";
          break;
        case "Creating":
          variant = "default";
          break;
        case "Deleting":
        case "Error":
          variant = "destructive";
          break;
        default:
          variant = "outline";
          break;
      }

      return transitioning ? (
        <ProgressStatusBadge label={status} />
      ) : (
        <Badge variant={variant}>
          {status}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }: { row: { original: Snapshot } }) => {
      const date = new Date(row.original.created_at);
      return date.toLocaleString();
    },
    meta: {
      fieldType: "date",
      visible: true
    }
  }
]

interface SnapshotsClientProps {
  regionId?: string;
  projectId?: string;
}

export function SnapshotsClient({ regionId, projectId }: SnapshotsClientProps) {
  const queryClient = useQueryClient();
  const listOptions = useMemo(
    () => snapshotsQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(listOptions);
  const [visibleSnapshots, setVisibleSnapshots] = useState<Snapshot[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<Snapshot[]>([]);
  const transitioningSnapshots = useMemo(
    () => visibleSnapshots.filter(isSnapshotTransitioning),
    [visibleSnapshots],
  );
  const transitionUpdates = useQueries({
    queries: transitioningSnapshots.map((snapshot) => ({
      ...snapshotQueryOptions(regionId, projectId, snapshot.id),
      refetchInterval: TRANSITION_REFETCH_INTERVAL_MS,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
    combine: collectTransitionUpdates<Snapshot>,
  });

  useEffect(() => {
    if (transitionUpdates.hasErrors) {
      void queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    }
    if (transitionUpdates.updates.size) {
      queryClient.setQueryData<Snapshot[]>(listOptions.queryKey, (current) =>
        current
          ? mergeSnapshotUpdates(current, transitionUpdates.updates)
          : current,
      );
    }
  }, [listOptions.queryKey, queryClient, transitionUpdates]);

  const refreshAfterDelete = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
  }, [listOptions.queryKey, queryClient]);

  const rowActions = useMemo(
    () => [
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: setDeleteTargets,
        isDisabled: (rows: Snapshot[]) =>
          rows.length === 0 || rows.some((snapshot) => !canDeleteSnapshot(snapshot)),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="snapshot"
        emptyIcon={Camera}
        rowActions={rowActions}
        onPageRowsChange={setVisibleSnapshots}
      />
      {deleteTargets.length ? (
        <SnapshotDeleteDialog
          snapshots={deleteTargets}
          projectId={projectId}
          regionId={regionId}
          onComplete={refreshAfterDelete}
          onOpenChange={() => setDeleteTargets([])}
        />
      ) : null}
    </>
  );
}
