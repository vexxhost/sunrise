'use client';

import { Badge } from "@/components/ui/badge";
import { Snapshot } from "@/lib/cinder";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

export const columns: ColumnDef<Snapshot>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: Snapshot } }) => row.original.name
    },
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: { row: { original: Snapshot } }) => row.original.description || "-"
    },
    {
      accessorKey: "volume_id",
      header: "Volume",
      meta: {
        monospace: true
      },
      cell: ({ row }: { row: { original: Snapshot } }) => row.original.volume_id
    },
    {
         accessorKey: "size",
         header: "Size",
         cell: ({ row }: { row: { original: Snapshot } }) => row.original.size + " GB"
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
      },
    {
      accessorKey: "created_at",
      header: "Created At",
      cell: ({ row }: { row: { original: Snapshot } }) => {
        const date = new Date(row.original.created_at);
        return date.toLocaleString();
      }
    }

  ]
