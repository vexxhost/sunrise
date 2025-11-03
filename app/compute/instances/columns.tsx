'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Flavor } from "@/lib/nova";
import { Image } from "@/lib/glance";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';

const IpAddress = ({ addresses }: { addresses: { [key: string]: { version: string, addr: string, "OS-EXT-IPS:type": string, "OS-EXT-IPS-MAC:mac_addr": string }[] } }) => {
  return Object.keys(addresses).map((key: string) => {
    return <table key={key}><tbody><tr className="pb-2">
      <td className="align-top pr-2"><small><strong>{key}</strong></small></td>
      <td className="align-top">{addresses[key].map((address) => <div key={address.addr}>{address.addr}</div>)}</td>
    </tr></tbody></table>
  })
}

interface InstanceColumnsContext {
  images: { [key: string]: string };
  flavors: { [key: string]: string };
  volumeImageIds: { [key: string]: string };
}

export function createInstanceColumns(context: InstanceColumnsContext): ColumnDef<Server>[] {
  const { images, flavors, volumeImageIds } = context;

  return [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center"
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
    },
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "image",
      header: "Image Name",
      cell: ({ row }) => {
        const image: Image = row.getValue('image')
        const attachedVolumes = row.original['os-extended-volumes:volumes_attached' as keyof Server] as { id: string }[]
        return image && (typeof image == 'object') ? images[image.id] : images[volumeImageIds[attachedVolumes[0]?.id]]
      }
    },
    {
      accessorKey: "addresses",
      header: "IP Address",
      cell: ({ row }) => <IpAddress addresses={row.getValue('addresses')} />
    },
    {
      accessorKey: "flavor",
      header: "Flavor",
      cell: ({ row }) => {
        const flavor: Flavor = row.getValue('flavor')
        return flavors[flavor.id]
      }
    },
    {
      accessorKey: "key_name",
      header: "Key Pair",
    },
    {
      accessorKey: "status",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Status
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const status = row.getValue('status')
        const variant = status === 'ACTIVE' ? 'default' : 'secondary'
        return (
          <Badge className="text-xs capitalize" variant={variant}>
            <span className="font-bold">{row.getValue('status')}</span>
          </Badge>
        )
      }
    },
    {
      accessorKey: "alert",
      header: "Alert",
      cell: ({ row }) => "N/A"
    },
    {
      accessorKey: "OS-EXT-AZ:availability_zone",
      header: "Availability Zone",
    },
    {
      accessorKey: "task",
      header: "Task",
      cell: ({ row }) => "None"
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      cell: ({ row }) => row.getValue('OS-EXT-STS:power_state') == 1 ? "Running" : "Stopped"
    },
    {
      accessorKey: "OS-SRV-USG:launched_at",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Age
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => formatDistanceToNow(Date.parse(row.getValue('OS-SRV-USG:launched_at')), { addSuffix: true })
    }
  ];
}
