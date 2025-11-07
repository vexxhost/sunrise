'use client';

import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Camera } from "lucide-react";
import { snapshotsQueryOptions } from "@/hooks/queries/useVolumes";
import { Badge } from "@/components/ui/badge";
import { Snapshot } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

const columns: ColumnDef<Snapshot>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.name,
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
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.description || "-",
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "volume_id",
    header: "Volume",
    meta: {
      monospace: true,
      fieldType: "string",
      visible: true
    },
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.volume_id
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }: { row: { original: Snapshot } }) => row.original.size + " GB",
    meta: {
      fieldType: "number",
      visible: true
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: Snapshot } }) => {
      const status = titleCase(row.original.status);
      let variant: "default" | "secondary" | "destructive" | "outline";

      // Determine the badge variant based on the status value
      switch (status) {
        case "Available":
          variant = "secondary";
          break;
        case "Creating":
          variant = "default";
          break;
        case "Deleting":
        case "Error":
          variant = "destructive";
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
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }: { row: { original: Snapshot } }) => {
      const date = new Date(row.original.created_at);
      return date.toLocaleString();
    },
    meta: {
      fieldType: "date",
      visible: true
    }
  }
]

interface SnapshotsClientProps {
  regionId?: string;
  projectId?: string;
}

export function SnapshotsClient({ regionId, projectId }: SnapshotsClientProps) {
  const { data, isRefetching, refetch } = useSuspenseQuery(snapshotsQueryOptions(regionId, projectId));

  return (
    <DataTable
      data={data}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="snapshot"
      emptyIcon={Camera}
    />
  );
}
