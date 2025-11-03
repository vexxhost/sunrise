'use client';

import { Badge } from "@/components/ui/badge";
import { Volume } from "@/lib/cinder";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

export const columns: ColumnDef<Volume>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: Volume } }) => row.original.name
    },
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: { row: { original: Volume } }) => row.original.description
    },
    {
         accessorKey: "size",
         header: "Size",
         cell: ({ row }: { row: { original: Volume } }) => row.original.size + " GB"
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: Volume } }) => {
          const status = titleCase(row.original.status);
          let badgeStyle;
          let label;

          // Determine the button style and label based on the status value
          switch (status) {
            case "In Use":
              badgeStyle = "w-22 bg-green-500 hover:bg-green-600 cursor-not-allowed opacity-75";
              break;
            case "Deleting":
              badgeStyle = "w-22 bg-red-500 hover:bg-red-600 cursor-not-allowed opacity-75";
              break;
            case "Available":
              badgeStyle = "w-22 bg-blue-500 hover:bg-blue-600 cursor";
              break;
            default: // Default case to handle any other possible values for the status property
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
    accessorKey: "group",
    header: "Group",
    cell: ({ row }: { row: { original: Volume } }) => row.original.group_id ? row.original.group_id : "-"
  },
    {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }: { row: { original: Volume } }) => row.original.volume_type
        },
        {
            accessorKey: "availability_zone",
            header: "Availability Zone",
            cell: ({ row }: { row: { original: Volume } }) => row.original.availability_zone
        },
        {
            accessorKey: "bootable",
            header: "Bootable",
            cell: ({ row }: { row: { original: Volume } }) => row.original.bootable ? "Yes" : "No"
          },
          {
            accessorKey: "encrypted",
            header: "Encrypted",
            cell: ({ row }: { row: { original: Volume } }) => row.original.encrypted ? "Yes" : "No"
          },
          {
            accessorKey: "multiattach",
            header: "Multi-Attached",
            cell: ({ row }: { row: { original: Volume } }) => row.original.multiattach ? "Yes" : "No"
          }

  ]
