'use client';

import { Badge } from "@/components/ui/badge";
import { Server, Flavor } from "@/types/openstack";
import { Image } from "@/types/openstack";
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
      header: "Instance Name",
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "id",
      header: "ID",
      meta: {
        fieldType: "string"
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
        fieldType: "string"
      }
    },
    {
      accessorKey: "addresses",
      header: "IP Address",
      cell: ({ row }) => <IpAddress addresses={row.getValue('addresses')} />,
      meta: {
        fieldType: "string"
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
        fieldType: "string"
      }
    },
    {
      accessorKey: "key_name",
      header: "Key Pair",
      meta: {
        fieldType: "string"
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
        fieldType: "string"
      }
    },
    {
      accessorKey: "alert",
      header: "Alert",
      cell: ({ row }) => "N/A",
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "OS-EXT-AZ:availability_zone",
      header: "Availability Zone",
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "task",
      header: "Task",
      cell: ({ row }) => "None",
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "OS-EXT-STS:power_state",
      header: "Power State",
      cell: ({ row }) => row.getValue('OS-EXT-STS:power_state') == 1 ? "Running" : "Stopped",
      meta: {
        fieldType: "number"
      }
    },
    {
      accessorKey: "OS-SRV-USG:launched_at",
      header: "Age",
      cell: ({ row }) => formatDistanceToNow(Date.parse(row.getValue('OS-SRV-USG:launched_at')), { addSuffix: true }),
      meta: {
        fieldType: "date"
      }
    }
  ];
}
