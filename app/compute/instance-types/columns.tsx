'use client';

import { Badge } from "@/components/ui/badge";
import { Flavor } from "@/lib/nova";
import { ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Flavor>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: Flavor } }) => row.original.name
    },
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "vcpus",
      header: "VCPUs",
      cell: ({ row }: { row: { original: Flavor } }) => row.original.vcpus
    },
    {
      accessorKey: "ram",
      header: "RAM",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ramGB = (row.original.ram / 1024).toFixed(2);
        return `${ramGB} GB`;
      }
    },
    {
      accessorKey: "disk",
      header: "Root Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        return row.original.disk > 0 ? `${row.original.disk} GB` : "-";
      }
    },
    {
      accessorKey: "OS-FLV-EXT-DATA:ephemeral",
      header: "Ephemeral Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ephemeral = row.original["OS-FLV-EXT-DATA:ephemeral"];
        return ephemeral > 0 ? `${ephemeral} GB` : "-";
      }
    },
    {
      accessorKey: "swap",
      header: "Swap Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const swap = row.original.swap;
        return swap && swap !== "" ? `${swap} MB` : "-";
      }
    },
    {
      accessorKey: "os-flavor-access:is_public",
      header: "Public",
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
      header: "Disabled",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const isDisabled = row.original["OS-FLV-DISABLED:disabled"];
        return (
          <Badge className={isDisabled ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}>
            {isDisabled ? "Yes" : "No"}
          </Badge>
        );
      }
    }
  ]
