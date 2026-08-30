'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import {
  InstanceLifecycleDialog,
  type InstanceMutationKind,
} from "@/components/Instance/InstanceLifecycleDialog";
import { Volume } from "@/types/openstack";
import { Image, Server } from "@/types/openstack";
import {
  CircleStop,
  Play,
  RotateCw,
  Server as ServerIcon,
  Trash2,
  Zap,
} from "lucide-react";
import {
  serverQueryOptions,
  serversQueryOptions,
  flavorsQueryOptions,
} from "@/hooks/queries/useServers";
import { volumesQueryOptions } from "@/hooks/queries/useVolumes";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { Badge } from "@/components/ui/badge";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from 'date-fns';
import { OsIcon } from "@/components/icons/OsIcon";
import { imageOperatingSystemMetadata } from "@/lib/openstack/image-metadata";
import {
  formatServerActivity,
  formatServerPowerState,
  formatServerStatus,
  formatServerTaskState,
  serverStatusBadgeVariant,
} from "@/lib/openstack/server-state";
import { cn } from "@/lib/utils";
import {
  canDeleteServer,
  canRunServerLifecycleAction,
  isServerTransitioning,
  mergeServerUpdates,
} from "@/lib/openstack/server-lifecycle";
import { resolveServerFlavor } from "@/lib/openstack/server-flavor";
import { ResourceLink } from "@/components/resources/ResourceLink";

const TRANSITION_REFETCH_INTERVAL_MS = 5_000;

function collectServerUpdates(results: readonly { data?: Server }[]) {
  return new Map(
    results
      .map((result) => result.data)
      .filter((server): server is Server => Boolean(server))
      .map((server) => [server.id, server]),
  );
}

const IpAddress = ({ addresses }: { addresses: { [key: string]: { version: string, addr: string, "OS-EXT-IPS:type": string, "OS-EXT-IPS-MAC:mac_addr": string }[] } }) => {
  return Object.keys(addresses).map((key: string) => {
    return (
      <div className="flex items-start gap-2 pb-1" key={key}>
        <small className="shrink-0 font-bold">{key}</small>
        <div>
          {addresses[key].map((address) => (
            <div key={address.addr}>{address.addr}</div>
          ))}
        </div>
      </div>
    );
  })
}

interface InstancesClientProps {
  regionId?: string;
  projectId?: string;
}

function getServerImageId(server: Server, volumeImageIds: Record<string, string>) {
  if (server.image && typeof server.image === "object" && server.image.id) {
    return server.image.id;
  }

  const attachedVolumes = server["os-extended-volumes:volumes_attached"];
  return volumeImageIds[attachedVolumes?.[0]?.id];
}

function formatAge(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "-";
  }

  return formatDistanceToNow(timestamp);
}

type ServerTableRow = Server & {
  imageId?: string;
  imageOsLabel: string;
  imageOsSlug: string;
  imageOsText?: string;
  imageName: string;
};

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

export function InstancesClient({ regionId, projectId }: InstancesClientProps) {
  const queryClient = useQueryClient();
  const listOptions = useMemo(
    () => serversQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  // Fetch servers
  const { data: serversData, isRefetching: isRefetchingServers, refetch: refetchServers } = useSuspenseQuery(
    listOptions,
  );
  const [visiblePageServers, setVisiblePageServers] = useState<Server[]>([]);
  const [pendingAction, setPendingAction] = useState<InstanceMutationKind | null>(null);
  const [actionTargets, setActionTargets] = useState<Server[]>([]);

  const transitioningVisibleServers = useMemo(
    () => visiblePageServers.filter(isServerTransitioning),
    [visiblePageServers],
  );
  const transitioningUpdates = useQueries({
    queries: transitioningVisibleServers.map((server) => ({
      ...serverQueryOptions(regionId, projectId, server.id),
      refetchInterval: TRANSITION_REFETCH_INTERVAL_MS,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
    combine: collectServerUpdates,
  });

  useEffect(() => {
    if (!transitioningUpdates.size) return;
    queryClient.setQueryData<Server[]>(listOptions.queryKey, (current) =>
      current ? mergeServerUpdates(current, transitioningUpdates) : current,
    );
  }, [listOptions.queryKey, queryClient, transitioningUpdates]);

  const handlePageRowsChange = useCallback((rows: ServerTableRow[]) => {
    setVisiblePageServers(rows);
  }, []);

  const openAction = useCallback(
    (action: InstanceMutationKind, instances: Server[]) => {
      setActionTargets(instances);
      setPendingAction(action);
    },
    [],
  );

  const closeAction = useCallback(() => {
    setPendingAction(null);
    setActionTargets([]);
  }, []);

  const refreshAfterAction = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    for (const server of actionTargets) {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "server", server.id],
      });
    }
  }, [actionTargets, listOptions.queryKey, projectId, queryClient, regionId]);

  // Fetch volumes
  const { data: volumesData } = useSuspenseQuery(volumesQueryOptions(regionId, projectId));

  // Fetch images
  const { data: imagesData } = useSuspenseQuery(imagesQueryOptions(regionId, projectId));

  // Fetch flavors
  const { data: flavorsData } = useSuspenseQuery(flavorsQueryOptions(regionId, projectId));

  // Process volume image IDs
  const volumeImageIds = useMemo(() => {
    return volumesData.reduce(
      (acc: { [key: string]: string }, volume: Volume) => {
        if (volume.volume_image_metadata) {
          acc[volume.id] = volume.volume_image_metadata.image_id;
        }
        return acc;
      },
      {}
    );
  }, [volumesData]);

  // Process images map by ID. Glance image names are not unique.
  const imagesById = useMemo(() => {
    const imagesMap: { [key: string]: Image } = {};
    imagesData.forEach((image: Image) => {
      imagesMap[image.id] = image;
    });
    return imagesMap;
  }, [imagesData]);

  const servers = useMemo<ServerTableRow[]>(() => {
    return serversData.map((server) => {
      const imageId = getServerImageId(server, volumeImageIds);
      const image = imageId ? imagesById[imageId] : undefined;
      const imageOs = imageOperatingSystemMetadata(image);

      return {
        ...server,
        imageId,
        imageName: image?.name || "",
        imageOsLabel: imageOs?.label ?? "VM",
        imageOsSlug: imageOs?.slug ?? "vm",
        imageOsText: imageOs?.known ? imageOs.version : imageOs?.label,
      };
    });
  }, [imagesById, serversData, volumeImageIds]);

  const columns = useMemo((): ColumnDef<ServerTableRow>[] => [
    {
      accessorKey: "name",
      header: "Instance Name",
      cell: ({ row }) => (
        <ResourceLink
          href={`/compute/instances/${encodeURIComponent(row.original.id)}`}
        >
          {row.original.name || "Unnamed instance"}
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
      accessorKey: "imageName",
      header: "Image Name",
      cell: ({ row }) => {
        const content = (
          <div
            className="flex w-64 max-w-64 min-w-0 flex-col gap-0.5"
            title={`${row.original.imageName || "-"}\n${row.original.imageOsLabel}`}
          >
            <FadedTableText value={row.original.imageName || "-"} />
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <OsIcon
                className="size-3.5"
                decorative
                slug={row.original.imageOsSlug}
              />
              {row.original.imageOsText ? (
                <span className="block min-w-0 truncate">
                  {row.original.imageOsText}
                </span>
              ) : null}
            </span>
          </div>
        );

        return row.original.imageId ? (
          <ResourceLink
            href={`/compute/images/${encodeURIComponent(row.original.imageId)}`}
            className="block w-fit max-w-full"
          >
            {content}
          </ResourceLink>
        ) : (
          content
        );
      },
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "addresses",
      header: "IP Address",
      cell: ({ row }) => <IpAddress addresses={row.getValue('addresses')} />,
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "flavor",
      header: "Flavor",
      cell: ({ row }) => {
        const flavor = resolveServerFlavor(row.original, flavorsData);
        return flavor.id ? (
          <ResourceLink
            href={`/compute/instance-flavors/${encodeURIComponent(flavor.id)}`}
          >
            {flavor.name}
          </ResourceLink>
        ) : (
          flavor.name
        );
      },
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "key_name",
      header: "Key Pair",
      meta: {
        fieldType: "string",
        visible: false
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status");
        const taskState = row.original["OS-EXT-STS:task_state"];
        const transitioning = isServerTransitioning(row.original);
        return (
          <div className="space-y-1">
            {transitioning ? (
              <ProgressStatusBadge
                label={formatServerActivity(status, taskState)}
                title={`Nova status: ${formatServerStatus(status)}`}
              />
            ) : (
              <Badge className="text-xs" variant={serverStatusBadgeVariant(status)}>
                <span className="font-bold">{formatServerStatus(status)}</span>
              </Badge>
            )}
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {transitioning
                ? `${formatServerStatus(status)} · ${formatServerPowerState(row.original["OS-EXT-STS:power_state"])}`
                : formatServerPowerState(row.original["OS-EXT-STS:power_state"])}
            </p>
          </div>
        )
      },
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "OS-EXT-AZ:availability_zone",
      header: "Availability Zone",
      meta: {
        fieldType: "string",
        visible: false
      }
    },
    {
      id: "task",
      accessorFn: (row) => row["OS-EXT-STS:task_state"],
      header: "Task",
      cell: ({ row }) => formatServerTaskState(row.original["OS-EXT-STS:task_state"]),
      meta: {
        fieldType: "string",
        visible: false
      }
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      cell: ({ row }) => formatServerPowerState(row.getValue("OS-EXT-STS:power_state")),
      meta: {
        fieldType: "number",
        visible: false
      }
    },
    {
      accessorKey: "created",
      header: "Age",
      cell: ({ row }) => formatAge(row.getValue("created")),
      meta: {
        fieldType: "string",
        visible: true
      }
    }
  ], [flavorsData]);

  return (
    <>
      <DataTable
        data={servers}
        isRefetching={isRefetchingServers}
        refetch={refetchServers}
        columns={columns}
        resourceName="instance"
        emptyIcon={ServerIcon}
        onPageRowsChange={handlePageRowsChange}
        rowActions={[
          {
            label: "Start",
            icon: Play,
            onClick: (rows) => openAction("start", rows),
            isDisabled: (rows) =>
              rows.some((server) => !canRunServerLifecycleAction(server, "start")),
          },
          {
            label: "Stop",
            icon: CircleStop,
            onClick: (rows) => openAction("stop", rows),
            isDisabled: (rows) =>
              rows.some((server) => !canRunServerLifecycleAction(server, "stop")),
          },
          {
            label: "Reboot",
            icon: RotateCw,
            onClick: (rows) => openAction("soft-reboot", rows),
            isDisabled: (rows) =>
              rows.some(
                (server) => !canRunServerLifecycleAction(server, "soft-reboot"),
              ),
          },
          {
            label: "Force reboot",
            icon: Zap,
            onClick: (rows) => openAction("hard-reboot", rows),
            isDisabled: (rows) =>
              rows.some(
                (server) => !canRunServerLifecycleAction(server, "hard-reboot"),
              ),
          },
          {
            label: "Delete",
            icon: Trash2,
            variant: "destructive",
            onClick: (rows) => openAction("delete", rows),
            isDisabled: (rows) => rows.some((server) => !canDeleteServer(server)),
          },
        ]}
      />
      <InstanceLifecycleDialog
        action={pendingAction}
        instances={actionTargets}
        onComplete={refreshAfterAction}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
        projectId={projectId}
        regionId={regionId}
      />
    </>
  );
}
