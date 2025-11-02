'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuSeparator, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Flavor } from "@/lib/nova";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

export const columns: ColumnDef<Flavor>[] = [
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
      cell: ({ row }: { row: { original: Flavor } }) => {
        return (
          <div className="flex items-center gap-2 text-xs font-semibold">
            {row.original.name}
          </div>
        );
      }
    },
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }: { row: { original: Flavor } }) => {
        return (
          <div className="font-mono text-xs">
            {row.original.id}
          </div>
        );
      }
    },
    {
      accessorKey: "vcpus",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              VCPUs
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => row.original.vcpus
    },
    {
      accessorKey: "ram",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              RAM
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ramGB = (row.original.ram / 1024).toFixed(2);
        return `${ramGB} GB`;
      }
    },
    {
      accessorKey: "disk",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Root Disk
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => {
        return row.original.disk > 0 ? `${row.original.disk} GB` : "-";
      }
    },
    {
      accessorKey: "OS-FLV-EXT-DATA:ephemeral",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Ephemeral Disk
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ephemeral = row.original["OS-FLV-EXT-DATA:ephemeral"];
        return ephemeral > 0 ? `${ephemeral} GB` : "-";
      }
    },
    {
      accessorKey: "swap",
      header: "Swap",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const swap = row.original.swap;
        return swap && swap !== "" ? `${swap} MB` : "-";
      }
    },
    {
      accessorKey: "os-flavor-access:is_public",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Public
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => {
        const isPublic = row.original["os-flavor-access:is_public"];
        return (
          <Badge className={isPublic ? "bg-green-500 hover:bg-green-600" : "bg-gray-500 hover:bg-gray-600"}>
            {isPublic ? "Yes" : "No"}
          </Badge>
        );
      }
    },
    {
      accessorKey: "OS-FLV-DISABLED:disabled",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Disabled
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
      },
      cell: ({ row }: { row: { original: Flavor } }) => {
        const isDisabled = row.original["OS-FLV-DISABLED:disabled"];
        return (
          <Badge className={isDisabled ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}>
            {isDisabled ? "Yes" : "No"}
          </Badge>
        );
      }
    },
    {
      accessorKey: "actions",
      header: "Actions",
      meta: {
        label: "Actions"
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
                <DropdownMenuItem>View Details</DropdownMenuItem>
                <DropdownMenuItem>Update Metadata</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      }
    }
  ]
