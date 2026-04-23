'use client';

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

const IpAddress = ({ addresses }: { addresses: { [key: string]: { version: string, addr: string, "OS-EXT-IPS:type": string, "OS-EXT-IPS-MAC:mac_addr": string }[] } }) => {
  return Object.keys(addresses).map((key: string) => {
    return <table key={key}><tbody><tr className="pb-2">
      <td className="align-top pr-2"><small><strong>{key}</strong></small></td>
      <td className="align-top">{addresses[key].map((address) => <div key={address.addr}>{address.addr}</div>)}</td>
    </tr></tbody></table>
  })
}

interface InstancesClientProps {
  regionId?: string;
  projectId?: string;
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

  // Process images map
  const images = useMemo(() => {
    const imagesMap: { [key: string]: string } = {};
    imagesData.forEach((image: Image) => {
      imagesMap[image.id] = image.name || '';
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

  const columns = useMemo((): ColumnDef<Server>[] => [
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
      accessorKey: "image",
      header: "Image Name",
      cell: ({ row }) => {
        const image: Image = row.getValue('image')
        const attachedVolumes = row.original['os-extended-volumes:volumes_attached' as keyof Server] as { id: string }[]
        return image && (typeof image == 'object') ? images[image.id] : images[volumeImageIds[attachedVolumes[0]?.id]]
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
        const flavor: Flavor = row.getValue('flavor')
        return flavors[flavor.id]
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
        const status = row.getValue('status')
        const variant = status === 'ACTIVE' ? 'default' : 'secondary'
        return (
          <Badge className="text-xs capitalize" variant={variant}>
            <span className="font-bold">{row.getValue('status')}</span>
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
      accessorKey: "task",
      header: "Task",
      cell: ({ row }) => "None",
      meta: {
        fieldType: "string",
        visible: true
      }
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      cell: ({ row }) => row.getValue('OS-EXT-STS:power_state') == 1 ? "Running" : "Stopped",
      meta: {
        fieldType: "number",
        visible: true
      }
    },
    {
      accessorKey: "OS-SRV-USG:launched_at",
      header: "Age",
      cell: ({ row }) => formatDistanceToNow(Date.parse(row.getValue('OS-SRV-USG:launched_at')), { addSuffix: true }),
      meta: {
        fieldType: "date",
        visible: true
      }
    }
  ], [images, flavors, volumeImageIds]);

  return (
    <DataTable
      data={serversData}
      isRefetching={isRefetchingServers}
      refetch={refetchServers}
      columns={columns}
      resourceName="instance"
      emptyIcon={ServerIcon}
    />
  );
}
