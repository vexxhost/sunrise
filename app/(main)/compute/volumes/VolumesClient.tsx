'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import {
  Camera,
  HardDrive,
  Link2,
  Link2Off,
  Pencil,
  Trash2,
} from "lucide-react";
import { volumeQueryOptions, volumesQueryOptions } from "@/hooks/queries/useVolumes";
import { Badge } from "@/components/ui/badge";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Volume } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import {
  VolumeMutationDialog,
  type VolumeMutationKind,
} from "@/components/Volume/VolumeMutationDialog";
import {
  canAttachVolume,
  canDeleteVolume,
  canDetachVolume,
  canEditVolume,
  canSnapshotVolume,
  isVolumeTransitioning,
  mergeVolumeUpdates,
} from "@/lib/openstack/storage-lifecycle";
import { formatVolumeStatus } from "@/lib/openstack/storage-status";
import { collectTransitionUpdates } from "@/lib/openstack/transition-poll";
import { ResourceLink } from "@/components/resources/ResourceLink";

const TRANSITION_REFETCH_INTERVAL_MS = 5_000;

function formatBooleanLike(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return "Yes";
  if (["false", "no", "0"].includes(normalized)) return "No";
  return String(value);
}

const columns: ColumnDef<Volume>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Volume } }) => (
      <ResourceLink
        href={`/compute/volumes/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed volume"}
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
    cell: ({ row }: { row: { original: Volume } }) => row.original.description,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Volume } }) => row.original.size + " GB",
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Volume } }) => {
      const status = formatVolumeStatus(row.original.status);
      const transitioning = isVolumeTransitioning(row.original);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (status) {
        case "In Use":
          variant = "secondary";
          break;
        case "Deleting":
          variant = "destructive";
          break;
        case "Available":
          variant = "default";
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
    accessorKey: "group",
    header: "Group",
    cell: ({ row }: { row: { original: Volume } }) => row.original.group_id ? row.original.group_id : "-",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }: { row: { original: Volume } }) => row.original.volume_type,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "availability_zone",
    header: "Availability Zone",
    cell: ({ row }: { row: { original: Volume } }) => row.original.availability_zone,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "bootable",
    header: "Bootable",
    cell: ({ row }: { row: { original: Volume } }) => formatBooleanLike(row.original.bootable),
    meta: {
      fieldType: "boolean",
      visible: true
    }
  },
  {
    accessorKey: "encrypted",
    header: "Encrypted",
    cell: ({ row }: { row: { original: Volume } }) => formatBooleanLike(row.original.encrypted),
    meta: {
      fieldType: "boolean",
      visible: true
    }
  },
  {
    accessorKey: "multiattach",
    header: "Multi-Attached",
    cell: ({ row }: { row: { original: Volume } }) => formatBooleanLike(row.original.multiattach),
    meta: {
      fieldType: "boolean",
      visible: true
    }
  }
]

interface VolumesClientProps {
  regionId?: string;
  projectId?: string;
}

export function VolumesClient({ regionId, projectId }: VolumesClientProps) {
  const queryClient = useQueryClient();
  const listOptions = useMemo(
    () => volumesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(listOptions);
  const [visibleVolumes, setVisibleVolumes] = useState<Volume[]>([]);
  const [action, setAction] = useState<VolumeMutationKind | null>(null);
  const [targets, setTargets] = useState<Volume[]>([]);
  const transitioningVolumes = useMemo(
    () => visibleVolumes.filter(isVolumeTransitioning),
    [visibleVolumes],
  );
  const transitionUpdates = useQueries({
    queries: transitioningVolumes.map((volume) => ({
      ...volumeQueryOptions(regionId, projectId, volume.id),
      refetchInterval: TRANSITION_REFETCH_INTERVAL_MS,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
    combine: collectTransitionUpdates<Volume>,
  });

  useEffect(() => {
    if (transitionUpdates.hasErrors) {
      void queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    }
    if (transitionUpdates.updates.size) {
      queryClient.setQueryData<Volume[]>(listOptions.queryKey, (current) =>
        current ? mergeVolumeUpdates(current, transitionUpdates.updates) : current,
      );
    }
  }, [listOptions.queryKey, queryClient, transitionUpdates]);

  const openAction = useCallback(
    (nextAction: VolumeMutationKind, volumes: Volume[]) => {
      setTargets(volumes);
      setAction(nextAction);
    },
    [],
  );
  const closeAction = useCallback(() => {
    setAction(null);
    setTargets([]);
  }, []);
  const refreshAfterAction = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    for (const volume of targets) {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "volume", volume.id],
      });
    }
  }, [listOptions.queryKey, projectId, queryClient, regionId, targets]);

  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: Volume[]) => openAction("edit", rows),
        isDisabled: (rows: Volume[]) =>
          rows.length !== 1 || !canEditVolume(rows[0]),
      },
      {
        label: "Attach to instance",
        icon: Link2,
        onClick: (rows: Volume[]) => openAction("attach", rows),
        isDisabled: (rows: Volume[]) =>
          rows.length !== 1 || !canAttachVolume(rows[0]),
      },
      {
        label: "Detach from instance",
        icon: Link2Off,
        onClick: (rows: Volume[]) => openAction("detach", rows),
        isDisabled: (rows: Volume[]) =>
          rows.length !== 1 || !canDetachVolume(rows[0]),
      },
      {
        label: "Create snapshot",
        icon: Camera,
        onClick: (rows: Volume[]) => openAction("snapshot", rows),
        isDisabled: (rows: Volume[]) =>
          rows.length !== 1 || !canSnapshotVolume(rows[0]),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: Volume[]) => openAction("delete", rows),
        isDisabled: (rows: Volume[]) =>
          rows.length === 0 || rows.some((volume) => !canDeleteVolume(volume)),
      },
    ],
    [openAction],
  );

  return (
    <>
      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="volume"
        emptyIcon={HardDrive}
        rowActions={rowActions}
        onPageRowsChange={setVisibleVolumes}
      />
      {action ? (
        <VolumeMutationDialog
          key={`${action}-${targets.map(({ id }) => id).join("-")}`}
          action={action}
          volumes={targets}
          projectId={projectId}
          regionId={regionId}
          onComplete={refreshAfterAction}
          onOpenChange={closeAction}
        />
      ) : null}
    </>
  );
}
