'use client';

import { DataTable } from "@/components/DataTable";
import { KeyRound } from "lucide-react";
import { useKeypairs } from "@/hooks/queries/useServers";
import { Badge } from "@/components/ui/badge";
import { Keypair } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

const columns: ColumnDef<Keypair>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Keypair } }) => row.original.name,
    meta: {
      fieldType: "string",
      visible: true
    }
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }: { row: { original: Keypair } }) => row.original.type,
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "fingerprint",
    header: "Fingerprint",
    cell: ({ row }: { row: { original: Keypair } }) => row.original.fingerprint,
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "public_key",
    header: "Public Key",
    cell: ({ row }: { row: { original: Keypair } }) => {
      const key = row.original.public_key;
      return key.length > 50 ? `${key.substring(0, 50)}...` : key
    },
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true
    }
  },
  {
    accessorKey: "user_id",
    header: "User ID",
    cell: ({ row }: { row: { original: Keypair } }) => row.original.user_id || "-",
    meta: {
      fieldType: "string",
      monospace: true,
      visible: false
    }
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    meta: {
      fieldType: "date",
      visible: false
    }
  }
];

export default function Page() {
  const { data, isLoading, isRefetching, refetch } = useKeypairs();

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="key pair"
      emptyIcon={KeyRound}
    />
  );
}
