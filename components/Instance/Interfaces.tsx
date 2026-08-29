'use client';
import { Port } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table"
import { Network } from "lucide-react";
import { DataTable } from "../DataTable";


export const columns: ColumnDef<Port>[] = [

  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Port } }) => row.original.name ? row.original.name : row.original.id,
    meta: {
      fieldType: "string"
    }
  },
  {
    accessorKey: "network_name",
    header: "Network",
    meta: {
      fieldType: "string"
    }
  },
  {
    accessorKey: "mac_address",
    header: "MAC Address",
    meta: {
      fieldType: "string"
    }
  },
  {
        accessorKey: "fixed_ips",
        header: "Fixed IP Address",
        cell: ({ row }: { row: { original: Port } }) => row.original.fixed_ips[0].ip_address,
        meta: {
          fieldType: "string"
        }
    },
    {
        accessorKey: "status",
        header: "Status",
        meta: {
          fieldType: "string"
        }
    },
    {
        accessorKey: "admin_state_up",
        header: "Admin State",
        cell: ({ row }: { row: { original: Port } }) => row.original.admin_state_up ? "Up" : "Down",
        meta: {
          fieldType: "boolean"
        }
    }

]

export function Interfaces( {networkPorts}: {networkPorts :Port[]} ) {

return (
  <>
    <div>
       <DataTable columns={columns} data={networkPorts} emptyIcon={Network} resourceName="interface"/>
    </div>
    </>

)
    }
  

