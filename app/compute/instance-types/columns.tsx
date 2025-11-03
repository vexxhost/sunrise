'use client';

import { Badge } from "@/components/ui/badge";
import { Flavor } from "@/lib/nova";
import { ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Flavor>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: Flavor } }) => row.original.name,
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
      accessorKey: "vcpus",
      header: "vCPUs",
      cell: ({ row }: { row: { original: Flavor } }) => row.original.vcpus,
      meta: {
        fieldType: "number"
      }
    },
    {
      accessorKey: "ram",
      header: "RAM",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ramGB = (row.original.ram / 1024).toFixed(2);
        return `${ramGB} GB`;
      },
      meta: {
        fieldType: "number"
      }
    },
    {
      accessorKey: "disk",
      header: "Root Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        return row.original.disk > 0 ? `${row.original.disk} GB` : "-";
      },
      meta: {
        fieldType: "number"
      }
    },
    {
      accessorKey: "OS-FLV-EXT-DATA:ephemeral",
      header: "Ephemeral Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const ephemeral = row.original["OS-FLV-EXT-DATA:ephemeral"];
        return ephemeral > 0 ? `${ephemeral} GB` : "-";
      },
      meta: {
        fieldType: "number"
      }
    },
    {
      accessorKey: "swap",
      header: "Swap Disk",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const swap = row.original.swap;
        return swap && swap !== "" ? `${swap} MB` : "-";
      },
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "os-flavor-access:is_public",
      header: "Public",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const isPublic = row.original["os-flavor-access:is_public"];
        return (
          <Badge variant={isPublic ? "secondary" : "outline"}>
            {isPublic ? "Yes" : "No"}
          </Badge>
        );
      },
      meta: {
        fieldType: "boolean"
      }
    },
    {
      accessorKey: "OS-FLV-DISABLED:disabled",
      header: "Disabled",
      cell: ({ row }: { row: { original: Flavor } }) => {
        const isDisabled = row.original["OS-FLV-DISABLED:disabled"];
        return (
          <Badge variant={isDisabled ? "destructive" : "secondary"}>
            {isDisabled ? "Yes" : "No"}
          </Badge>
        );
      },
      meta: {
        fieldType: "boolean"
      }
    }
  ]
