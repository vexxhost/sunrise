'use client';
import { Port } from "@/lib/network";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { MoreHorizontal, Network } from "lucide-react";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useState } from "react";
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
    },
      {
        accessorKey: "actions",
        header: "Actions",
        meta: {
          label: "Actions",
          fieldType: "string"
        },
        enableHiding: false,
        cell: ({ row }) => {
          return (
            <div className="relative flex justify-center items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Edit SecurityGroup</DropdownMenuItem>
                  <DropdownMenuItem>Edit Port</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }
      }

]
  // Setup search options for volumes to be sent to the table components filter selection
  export const searchoptions : DynamicInterface = {
    name: "Name",
    status: "Status",
    network_name: "Network",
    };  

export function Interfaces( {networkPorts}: {networkPorts :Port[]} ) {

const table = useReactTable<Port>({
    data: networkPorts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
return (
  <>
    <div>
       <DataTable columns={columns} data={networkPorts} searchOptions={searchoptions} emptyIcon={Network} resourceName="interface"/>
    </div>
    </>

)
    }
  


