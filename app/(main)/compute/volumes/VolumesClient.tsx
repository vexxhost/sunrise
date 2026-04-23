'use client';

import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { HardDrive } from "lucide-react";
import { volumesQueryOptions } from "@/hooks/queries/useVolumes";
import { Badge } from "@/components/ui/badge";
import { Volume } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

const columns: ColumnDef<Volume>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Volume } }) => row.original.name,
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
    cell: ({ row }: { row: { original: Volume } }) => row.original.description,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Volume } }) => row.original.size + " GB",
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Volume } }) => {
      const status = titleCase(row.original.status);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (status) {
        case "In Use":
          variant = "secondary";
          break;
        case "Deleting":
          variant = "destructive";
          break;
        case "Available":
          variant = "default";
          break;
        default:
          variant = "outline";
          break;
      }

      return (
        <Badge variant={variant}>
          {status}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "group",
    header: "Group",
    cell: ({ row }: { row: { original: Volume } }) => row.original.group_id ? row.original.group_id : "-",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }: { row: { original: Volume } }) => row.original.volume_type,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "availability_zone",
    header: "Availability Zone",
    cell: ({ row }: { row: { original: Volume } }) => row.original.availability_zone,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "bootable",
    header: "Bootable",
    cell: ({ row }: { row: { original: Volume } }) => row.original.bootable ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: true
    }
  },
  {
    accessorKey: "encrypted",
    header: "Encrypted",
    cell: ({ row }: { row: { original: Volume } }) => row.original.encrypted ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: true
    }
  },
  {
    accessorKey: "multiattach",
    header: "Multi-Attached",
    cell: ({ row }: { row: { original: Volume } }) => row.original.multiattach ? "Yes" : "No",
    meta: {
      fieldType: "boolean",
      visible: true
    }
  }
]

interface VolumesClientProps {
  regionId?: string;
  projectId?: string;
}

export function VolumesClient({ regionId, projectId }: VolumesClientProps) {
  const { data, isRefetching, refetch } = useSuspenseQuery(volumesQueryOptions(regionId, projectId));

  return (
    <DataTable
      data={data}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="volume"
      emptyIcon={HardDrive}
    />
  );
}
