'use client';

import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Cpu } from "lucide-react";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import { Badge } from "@/components/ui/badge";
import { Flavor } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Flavor>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Flavor } }) => row.original.name,
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
    accessorKey: "description",
    header: "Description",
    cell: ({ row }: { row: { original: Flavor } }) => row.original.description || "-",
    meta: {
      fieldType: "string",
      visible: false
    }
  },
  {
    accessorKey: "vcpus",
    header: "vCPUs",
    cell: ({ row }: { row: { original: Flavor } }) => row.original.vcpus,
    meta: {
      fieldType: "number",
      visible: true
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
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "disk",
    header: "Root Disk",
    cell: ({ row }: { row: { original: Flavor } }) => {
      return row.original.disk > 0 ? `${row.original.disk} GB` : "-";
    },
    meta: {
      fieldType: "number",
      visible: true
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
      fieldType: "number",
      visible: true
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
      fieldType: "string",
      visible: false
    }
  },
  {
    accessorKey: "rxtx_factor",
    header: "RX/TX Factor",
    cell: ({ row }: { row: { original: Flavor } }) => row.original.rxtx_factor,
    meta: {
      fieldType: "number",
      visible: false
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
      fieldType: "boolean",
      visible: true
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
      fieldType: "boolean",
      visible: false
    }
  },
  {
    accessorKey: "extra_specs",
    header: "Extra Specs",
    cell: ({ row }: { row: { original: Flavor } }) => {
      const specs = row.original.extra_specs;
      if (!specs || Object.keys(specs).length === 0) {
        return "-";
      }
      const specCount = Object.keys(specs).length;
      const firstThree = Object.entries(specs).slice(0, 3);
      return (
        <div className="flex flex-wrap gap-1">
          {firstThree.map(([key, value]) => (
            <Badge key={key} variant="outline" className="text-xs">
              {key}: {value}
            </Badge>
          ))}
          {specCount > 3 && (
            <Badge variant="outline" className="text-xs">
              +{specCount - 3}
            </Badge>
          )}
        </div>
      );
    },
    meta: {
      fieldType: "string",
      visible: false
    }
  }
]

interface InstanceTypesClientProps {
  regionId?: string;
  projectId?: string;
}

export function InstanceTypesClient({ regionId, projectId }: InstanceTypesClientProps) {
  const { data, isLoading, isRefetching, refetch } = useQuery(flavorsQueryOptions(regionId, projectId));

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="instance type"
      emptyIcon={Cpu}
    />
  );
}
