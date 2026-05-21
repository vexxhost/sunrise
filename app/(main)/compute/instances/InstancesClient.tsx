'use client';

import Link from "next/link";
import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Volume } from "@/types/openstack";
import { Image, Server, Flavor } from "@/types/openstack";
import { Server as ServerIcon } from "lucide-react";
import { serversQueryOptions, flavorsQueryOptions } from "@/hooks/queries/useServers";
import { volumesQueryOptions } from "@/hooks/queries/useVolumes";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from 'date-fns';
import { OsIcon } from "@/components/icons/OsIcon";
import { imageOperatingSystemMetadata } from "@/lib/openstack/image-metadata";
import {
  formatServerPowerState,
  formatServerStatus,
  formatServerTaskState,
  serverStatusBadgeVariant,
} from "@/lib/openstack/server-state";
import { cn } from "@/lib/utils";

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

function getFlavorName(server: Server, flavors: Record<string, string>) {
  const flavor = server.flavor as Server["flavor"] & {
    id?: string | number;
    name?: string;
    original_name?: string;
  };

  if (!flavor || typeof flavor !== "object") {
    return "unavailable";
  }

  if (typeof flavor.original_name === "string" && flavor.original_name.trim()) {
    return flavor.original_name;
  }

  if (flavor.id !== undefined && flavors[String(flavor.id)]) {
    return flavors[String(flavor.id)];
  }

  if (typeof flavor.name === "string" && flavor.name.trim()) {
    return flavor.name;
  }

  return "unavailable";
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
  return (
    <span className={cn("relative block min-w-0 overflow-hidden", className)}>
      <span className="block whitespace-nowrap">{value}</span>
      <span className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent group-hover/row:from-muted/50" />
    </span>
  );
}

export function InstancesClient({ regionId, projectId }: InstancesClientProps) {
  console.log('[InstancesClient] render', { regionId, projectId });

  // Fetch servers
  const { data: serversData, isRefetching: isRefetchingServers, refetch: refetchServers } = useSuspenseQuery(
    serversQueryOptions(regionId, projectId)
  );

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

  // Process flavors map
  const flavors = useMemo(() => {
    const flavorsMap: { [key: string]: string } = {};
    flavorsData.forEach((flavor: Flavor) => {
      flavorsMap[flavor.id] = flavor.name;
    });
    return flavorsMap;
  }, [flavorsData]);

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
          <Link
            href={`/compute/images/${encodeURIComponent(row.original.imageId)}`}
            className="block w-fit max-w-full hover:underline"
          >
            {content}
          </Link>
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
        return getFlavorName(row.original, flavors)
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
        visible: true
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status");
        return (
          <Badge className="text-xs" variant={serverStatusBadgeVariant(status)}>
            <span className="font-bold">{formatServerStatus(status)}</span>
          </Badge>
        )
      },
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "alert",
      header: "Alert",
      cell: ({ row }) => "N/A",
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
        visible: true
      }
    },
    {
      id: "task",
      accessorFn: (row) => row["OS-EXT-STS:task_state"],
      header: "Task",
      cell: ({ row }) => formatServerTaskState(row.original["OS-EXT-STS:task_state"]),
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      cell: ({ row }) => formatServerPowerState(row.getValue("OS-EXT-STS:power_state")),
      meta: {
        fieldType: "number",
        visible: true
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
  ], [flavors]);

  return (
    <DataTable
      data={servers}
      isRefetching={isRefetchingServers}
      refetch={refetchServers}
      columns={columns}
      resourceName="instance"
      emptyIcon={ServerIcon}
    />
  );
}
