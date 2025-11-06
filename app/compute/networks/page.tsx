'use client';

import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Network as NetworkIcon } from "lucide-react";
import { networksQueryOptions } from "@/hooks/queries/useNetworks";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import { Badge } from "@/components/ui/badge";
import { Network } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

const columns: ColumnDef<Network>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Network } }) => row.original.name,
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
    cell: ({ row }: { row: { original: Network } }) => row.original.description,
    meta: {
      fieldType: "string",
      visible: true
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
      fieldType: "string",
      visible: true
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
      fieldType: "boolean",
      visible: true
    }
  },
  {
    accessorKey: "external",
    header: "external",
    cell: ({ row }: { row: { original: Network } }) => {
      return (
        <Badge variant={row.original["router:external"] ? "secondary" : "destructive"}>
          {row.original["router:external"] ? "Yes" : "No"}
        </Badge>
      );
    },
    meta: {
      fieldType: "boolean",
      visible: true
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
      fieldType: "string",
      visible: true
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
      fieldType: "boolean",
      visible: true
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
      fieldType: "string",
      visible: true
    }
  }
]

export default function Page() {
  const { region, project } = useKeystoneStore();
  const { data, isLoading, isRefetching, refetch } = useQuery(networksQueryOptions(region?.id, project?.id));

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="network"
      emptyIcon={NetworkIcon}
    />
  );
}
