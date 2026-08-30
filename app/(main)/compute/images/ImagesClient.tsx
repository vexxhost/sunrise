'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useQueries,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { imageQueryOptions, imagesQueryOptions } from "@/hooks/queries/useImages";
import { Badge } from "@/components/ui/badge";
import type { Image } from "@/types/openstack/glance";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";
import bytes from 'bytes';
import { OsIcon } from "@/components/icons/OsIcon";
import { imageOperatingSystemMetadata } from "@/lib/openstack/image-metadata";
import {
  ImageMutationDialog,
  type ImageMutationKind,
} from "@/components/Image/ImageMutationDialog";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { canDeleteImage, canEditImage } from "@/lib/openstack/image-lifecycle";

const ACTIVE_IMAGE_REFETCH_INTERVAL_MS = 5000;

const ACTIVE_IMAGE_STATUSES: Image["status"][] = [
  "queued",
  "saving",
  "uploading",
  "importing",
  "pending_delete",
];

function isActiveImageStatus(status: Image["status"]) {
  return ACTIVE_IMAGE_STATUSES.includes(status);
}

function collectImageUpdates(results: readonly { data?: Image }[]) {
  return new Map(
    results
      .map((result) => result.data)
      .filter((image): image is Image => Boolean(image))
      .map((image) => [image.id, image]),
  );
}

function formatImageStatus(status: Image["status"]) {
  return titleCase(status.replace(/_/g, " "));
}

const columns: ColumnDef<Image>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Image } }) => {
      const imageOs = imageOperatingSystemMetadata(row.original);
      const osLabel = imageOs?.label ?? "VM";
      const osSlug = imageOs?.slug ?? "vm";
      const osText = imageOs?.known ? imageOs.version : imageOs?.label;

      return (
        <div
          className="flex min-w-0 flex-col gap-0.5"
          title={`${row.original.name || "-"}\n${osLabel}`}
        >
          <span className="block min-w-0 truncate">
            {row.original.name || "-"}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <OsIcon className="size-3.5" decorative slug={osSlug} />
            {osText ? (
              <span className="block min-w-0 truncate">{osText}</span>
            ) : null}
          </span>
        </div>
      );
    },
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
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Image } }) => {
      const status = formatImageStatus(row.original.status);
      const active = isActiveImageStatus(row.original.status);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (row.original.status) {
        case "active":
          variant = "default";
          break;
        case "queued":
        case "saving":
        case "uploading":
        case "importing":
          variant = "secondary";
          break;
        case "killed":
        case "deleted":
        case "pending_delete":
          variant = "destructive";
          break;
        case "deactivated":
        default:
          variant = "outline";
          break;
      }

      return active ? (
        <ProgressStatusBadge label={status} />
      ) : (
        <Badge variant={variant}>{status}</Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "visibility",
    header: "Visibility",
    cell: ({ row }: { row: { original: Image } }) => {
      const visibility = titleCase(row.original.visibility);
      let variant: "default" | "secondary" | "destructive" | "outline";

      switch (row.original.visibility) {
        case "public":
          variant = "default";
          break;
        case "community":
          variant = "secondary";
          break;
        case "shared":
        case "private":
        default:
          variant = "outline";
          break;
      }

      return (
        <Badge variant={variant}>
          {visibility}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Image } }) => {
      if (row.original.size === null || row.original.size === undefined) {
        return "-";
      }
      return bytes(row.original.size, { unitSeparator: ' ' });
    },
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "virtual_size",
    header: "Virtual Size",
    cell: ({ row }: { row: { original: Image } }) => {
      if (row.original.virtual_size === null || row.original.virtual_size === undefined) {
        return "-";
      }
      return bytes(row.original.virtual_size, { unitSeparator: ' ' });
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "disk_format",
    header: "Disk Format",
    cell: ({ row }: { row: { original: Image } }) => row.original.disk_format || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "container_format",
    header: "Container Format",
    cell: ({ row }: { row: { original: Image } }) => row.original.container_format || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "min_disk",
    header: "Minimum Disk Space",
    cell: ({ row }: { row: { original: Image } }) => {
      return row.original.min_disk > 0 ? `${row.original.min_disk} GB` : "-";
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "min_ram",
    header: "Minimum Memory",
    cell: ({ row }: { row: { original: Image } }) => {
      return row.original.min_ram > 0 ? `${row.original.min_ram} MB` : "-";
    },
    meta: {
      fieldType: "number",
      visible: false
    }
  },
  {
    accessorKey: "checksum",
    header: "Checksum",
    cell: ({ row }: { row: { original: Image } }) => row.original.checksum || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "os_hash_algo",
    header: "Hash Algorithm",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hash_algo || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "os_hash_value",
    header: "Hash Value",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hash_value || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "protected",
    header: "Protected",
    cell: ({ row }: { row: { original: Image } }) => row.original.protected ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: false
    }
  },
  {
    accessorKey: "os_hidden",
    header: "Hidden",
    cell: ({ row }: { row: { original: Image } }) => row.original.os_hidden ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: false
    }
  },
  {
    accessorKey: "owner",
    header: "Owner",
    cell: ({ row }: { row: { original: Image } }) => row.original.owner || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "direct_url",
    header: "Direct URL",
    cell: ({ row }: { row: { original: Image } }) => row.original.direct_url || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    meta: {
      fieldType: "date",
      visible: true
    }
  },
  {
    accessorKey: "updated_at",
    header: "Updated At",
    meta: {
      fieldType: "date",
      visible: false
    }
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }: { row: { original: Image } }) => {
      const tags = row.original.tags;
      if (!tags || tags.length === 0) {
        return "-";
      }
      return (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{tags.length - 3}
            </Badge>
          )}
        </div>
      );
    },
    meta: {
      fieldType: "string",
      visible: false
    }
  }
];

interface ImagesClientProps {
  regionId?: string;
  projectId?: string;
}

export function ImagesClient({ regionId, projectId }: ImagesClientProps) {
  const queryClient = useQueryClient();
  const imageListOptions = useMemo(
    () => imagesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery({
    ...imageListOptions,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [visiblePageImages, setVisiblePageImages] = useState<Image[]>([]);
  const [pendingAction, setPendingAction] = useState<ImageMutationKind | null>(null);
  const [actionTargets, setActionTargets] = useState<Image[]>([]);
  const activeVisibleImages = useMemo(
    () =>
      visiblePageImages.filter((image) => isActiveImageStatus(image.status)),
    [visiblePageImages],
  );
  const activeVisibleImageUpdates = useQueries({
    queries: activeVisibleImages.map((image) => ({
      ...imageQueryOptions(regionId, projectId, image.id),
      refetchInterval: ACTIVE_IMAGE_REFETCH_INTERVAL_MS,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
    combine: collectImageUpdates,
  });

  const handlePageRowsChange = useCallback((images: Image[]) => {
    setVisiblePageImages(images);
  }, []);

  const openAction = useCallback(
    (action: ImageMutationKind, images: Image[]) => {
      setPendingAction(action);
      setActionTargets(images);
    },
    [],
  );

  const closeAction = useCallback(() => {
    setPendingAction(null);
    setActionTargets([]);
  }, []);

  const refreshAfterAction = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: imageListOptions.queryKey });
    for (const image of actionTargets) {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "image", image.id],
      });
    }
  }, [actionTargets, imageListOptions.queryKey, projectId, queryClient, regionId]);

  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: Image[]) => openAction("edit", rows),
        isDisabled: (rows: Image[]) =>
          rows.length !== 1 || !canEditImage(rows[0], projectId),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: Image[]) => openAction("delete", rows),
        isDisabled: (rows: Image[]) =>
          rows.length === 0 ||
          rows.some((image) => !canDeleteImage(image, projectId)),
      },
    ],
    [openAction, projectId],
  );

  useEffect(() => {
    if (activeVisibleImageUpdates.size === 0) {
      return;
    }

    queryClient.setQueryData<Image[]>(imageListOptions.queryKey, (existing) => {
      if (!existing) {
        return existing;
      }

      let changed = false;
      const nextImages = existing.map((image) => {
        const updated = activeVisibleImageUpdates.get(image.id);
        if (!updated) {
          return image;
        }

        changed = changed || updated !== image;
        return updated;
      });

      return changed ? nextImages : existing;
    });
  }, [
    activeVisibleImageUpdates,
    imageListOptions.queryKey,
    queryClient,
  ]);

  return (
    <>
      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="image"
        emptyIcon={ImageIcon}
        rowActions={rowActions}
        onPageRowsChange={handlePageRowsChange}
      />
      {pendingAction ? (
        <ImageMutationDialog
          key={`${pendingAction}-${actionTargets.map(({ id }) => id).join("-")}`}
          action={pendingAction}
          images={actionTargets}
          projectId={projectId}
          regionId={regionId}
          onComplete={refreshAfterAction}
          onOpenChange={closeAction}
        />
      ) : null}
    </>
  );
}
