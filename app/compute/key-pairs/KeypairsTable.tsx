'use client';

import { DataTable, DataTableAction, DataTableRowAction } from "@/components/DataTable";
import { KeyRound, Upload, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/hooks/queries/useApiClient";
import { Keypair, KeypairListResponse } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";

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

interface KeypairsTableProps {
  regionId: string | undefined;
  projectId: string | undefined;
}

export function KeypairsTable({ regionId, projectId }: KeypairsTableProps) {
  const client = useApiClient('nova');

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      const data = await client!.get('os-keypairs').json<KeypairListResponse>();
      // Nova returns keypairs as an array of objects with "keypair" property
      return data.keypairs.map(item => item.keypair);
    },
    enabled: !!client,
  });

  const actions: DataTableAction[] = [
    {
      label: 'Import',
      variant: 'outline',
      icon: Upload,
      onClick: () => console.log('Import key pair clicked'),
    },
    {
      label: 'Create',
      variant: 'default',
      icon: Plus,
      onClick: () => console.log('Create key pair clicked'),
    },
  ];

  const rowActions: DataTableRowAction<Keypair>[] = [
    {
      label: 'Delete',
      variant: 'destructive',
      icon: Trash2,
      onClick: (rows) => console.log('Delete key pairs:', rows),
    },
  ];

  return (
    <DataTable
      data={data || []}
      isLoading={isLoading}
      isRefetching={isRefetching}
      refetch={refetch}
      columns={columns}
      resourceName="key pair"
      emptyIcon={KeyRound}
      actions={actions}
      rowActions={rowActions}
    />
  );
}
