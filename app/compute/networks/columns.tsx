'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network } from "@/lib/network";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { titleCase } from "title-case";

export const columns: ColumnDef<Network>[] = [
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
      cell: ({ row }: { row: { original: Network } }) => row.original.name
    },
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: { row: { original: Network } }) => row.original.description
    },
    {
         accessorKey: "subnets",
         header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              > Subnets Associated <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            )
      },
         cell: ({ row }: { row: { original: Network } }) => {
            return (
              <>
                {row.original.subnets.map((subnet) => (
                  <div key={subnet} className="flex items-center gap-2 text-xs">
                    {subnet}
                  </div>
                ))}
              </>
            );
         },

    },
    {
      accessorKey: "shared",
      header: "Shared",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.shared ? "success" : "error"}>
            {row.original.shared ? "Yes" : "No"}
          </Badge>
        );
      }

    },{
      accessorKey: "external",
      header: "external",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original["router:external"] ? "success" : "error"}>
          {row.original["router:external"] ? "Yes" : "No"}
        </Badge>        );
      }

    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.status === "ACTIVE" ? "success" : "error"}>
            {titleCase(row.original.status)}
          </Badge>
        );
      }
    },
    {
      accessorKey: "admin_state_up",
      header: "Admin State",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.admin_state_up ? "success" : "error"}>
            {row.original.admin_state_up ? "Up" : "Down"}
          </Badge>
        );
      }
    },
    {
      accessorKey: "availability_zones",
      header: "Availability Zones",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <>
            {row.original.availability_zones.map((az) => (
              <div key={az} className="flex items-center gap-2 text-xs">
                {az}
              </div>
            ))}
          </>
        );
      }
    }

  ]
