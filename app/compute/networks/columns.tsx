'use client';

import { Badge } from "@/components/ui/badge";
import { Network } from "@/lib/network";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

export const columns: ColumnDef<Network>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: Network } }) => row.original.name,
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
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: { row: { original: Network } }) => row.original.description,
      meta: {
        fieldType: "string"
      }
    },
    {
         accessorKey: "subnets",
         header: "Subnets Associated",
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
         meta: {
           fieldType: "string"
         }

    },
    {
      accessorKey: "shared",
      header: "Shared",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.shared ? "secondary" : "destructive"}>
            {row.original.shared ? "Yes" : "No"}
          </Badge>
        );
      },
      meta: {
        fieldType: "boolean"
      }

    },{
      accessorKey: "external",
      header: "external",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original["router:external"] ? "secondary" : "destructive"}>
          {row.original["router:external"] ? "Yes" : "No"}
        </Badge>        );
      },
      meta: {
        fieldType: "boolean"
      }

    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.status === "ACTIVE" ? "secondary" : "destructive"}>
            {titleCase(row.original.status)}
          </Badge>
        );
      },
      meta: {
        fieldType: "string"
      }
    },
    {
      accessorKey: "admin_state_up",
      header: "Admin State",
      cell: ({ row }: { row: { original: Network } }) => {
        return (
          <Badge variant={row.original.admin_state_up ? "secondary" : "destructive"}>
            {row.original.admin_state_up ? "Up" : "Down"}
          </Badge>
        );
      },
      meta: {
        fieldType: "boolean"
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
      },
      meta: {
        fieldType: "string"
      }
    }

  ]
