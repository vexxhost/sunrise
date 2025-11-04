'use client';

import { Badge } from "@/components/ui/badge";
import { Keypair } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { titleCase } from "title-case";

export const columns: ColumnDef<Keypair>[] = [
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
    cell: ({ row }: { row: { original: Keypair } }) => {
      const type = row.original.type;
      return (
        <Badge variant="outline">
          {type.toUpperCase()}
        </Badge>
      );
    },
    meta: {
      fieldType: "string",
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
      // Show first 50 characters with ellipsis
      return (
        <span className="font-mono text-xs" title={key}>
          {key.length > 50 ? `${key.substring(0, 50)}...` : key}
        </span>
      );
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
      visible: true
    }
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    meta: {
      fieldType: "date",
      visible: true
    }
  }
];
