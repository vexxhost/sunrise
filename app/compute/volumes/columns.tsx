'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuSeparator,DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuItem  } from "@/components/ui/dropdown-menu";
import { Volume } from "@/lib/cinder";
import { capitalize, capitalizeFirstLetters } from "@/lib/utils";
import { } from "@radix-ui/react-dropdown-menu";
import { ColumnDef } from "@tanstack/react-table";
import { stat } from "fs";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

export const columns: ColumnDef<Volume>[] = [
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
      cell: ({ row }: { row: { original: Volume } }) =>
        {
          return (
                <div className="flex items-center gap-2 text-xs" >
                   {row.original.name ? row.original.name : row.original.id}
                   </div>
                );
        }
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: { row: { original: Volume } }) => row.original.description
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
         cell: ({ row }: { row: { original: Volume } }) => row.original.size + " GB"
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
        cell: ({ row }: { row: { original: Volume } }) => {
          const status = capitalizeFirstLetters(row.original.status);
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
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          > Group <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
  },
    cell: ({ row }: { row: { original: Volume } }) => row.original.group_id ? row.original.group_id : "-"
  },
    {
        accessorKey: "type",
        header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              > Type <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            )
      },
        cell: ({ row }: { row: { original: Volume } }) => row.original.volume_type
        },
        {
            accessorKey: "availability_zone",
            header: ({ column }) => {
                return (
                  <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                  > Availability Zone <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                )
          },
            cell: ({ row }: { row: { original: Volume } }) => row.original.availability_zone
        },
        {
            accessorKey: "bootable",
            header: ({ column }) => {
                return (
                  <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                  > Bootable <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                )
          },
            cell: ({ row }: { row: { original: Volume } }) => row.original.bootable ? "Yes" : "No"
          },
          {
            accessorKey: "encrypted",
            header: ({ column }) => {
                return (
                  <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                  > Encrypted <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                )
          },
            cell: ({ row }: { row: { original: Volume } }) => row.original.encrypted ? "Yes" : "No"
          },
          {
            accessorKey: "multiattach",
            header: ({ column }) => {
                return (
                  <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                  > Multi-Attached <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                )
          },            cell: ({ row }: { row: { original: Volume } }) => row.original.multiattach ? "Yes" : "No"
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
                    <DropdownMenuItem>View</DropdownMenuItem>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          }
        }

  ]
