'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Snapshot } from "@/lib/cinder";
import { Network } from "@/lib/network";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { titleCase } from "title-case";

export const columns: ColumnDef<Snapshot>[] = [
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
      cell: ({ row }: { row: { original: Snapshot } }) => row.original.name
    },
    {
      accessorKey: "id",
      header: "ID",
      meta: {
        monospace: true
      },
      cell: ({ row }: { row: { original: Snapshot } }) => row.original.id
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
         header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              > Size <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            )
      },
         cell: ({ row }: { row: { original: Snapshot } }) => row.original.size + " GB"
    },
    {
        accessorKey: "status",
        header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              > Status <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            )
      },
        cell: ({ row }: { row: { original: Snapshot } }) => {
          const status = titleCase(row.original.status);
          let badgeStyle;

          // Determine the badge style based on the status value
          switch (status) {
            case "Available":
              badgeStyle = "w-22 bg-green-500 hover:bg-green-600 cursor-not-allowed opacity-75";
              break;
            case "Creating":
              badgeStyle = "w-22 bg-blue-500 hover:bg-blue-600 cursor-not-allowed opacity-75";
              break;
            case "Deleting":
              badgeStyle = "w-22 bg-red-500 hover:bg-red-600 cursor-not-allowed opacity-75";
              break;
            case "Error":
              badgeStyle = "w-22 bg-red-700 hover:bg-red-800 cursor-not-allowed opacity-75";
              break;
            default:
              badgeStyle = "w-22 bg-gray-500 hover:bg-gray-600 cursor-not-allowed opacity-75";
              break;
          }

          return (
            <Badge className= {badgeStyle} >
              {status}
            </Badge>
          );
        },
      },
    {
      accessorKey: "created_at",
      header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            > Created At <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
    },
      cell: ({ row }: { row: { original: Snapshot } }) => {
        const date = new Date(row.original.created_at);
        return date.toLocaleString();
      }
    }

  ]
