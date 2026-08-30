'use client';

import { DataTable } from "@/components/DataTable";
import { KeyRound, Trash2 } from "lucide-react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Keypair } from "@/types/openstack";
import { ColumnDef } from "@tanstack/react-table";
import { keypairsQueryOptions } from "@/hooks/queries/useServers";
import { RESOURCE_NAME } from "./constants";
import { useState, useTransition } from "react";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { deleteKeypairAction } from "@/lib/openstack/nova-actions";
import { ResourceLink } from "@/components/resources/ResourceLink";

export const keypairColumns: ColumnDef<Keypair>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: Keypair } }) => (
      <ResourceLink
        href={`/compute/key-pairs/${encodeURIComponent(row.original.name)}`}
      >
        {row.original.name}
      </ResourceLink>
    ),
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
  const queryClient = useQueryClient();
  const { data, isRefetching, refetch } = useSuspenseQuery(
    keypairsQueryOptions(regionId, projectId)
  );
  const [deleteTargets, setDeleteTargets] = useState<Keypair[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deleteKeypairs = () => {
    if (!projectId || !regionId) return;
    startTransition(async () => {
      setDeleteError(null);
      const failures: string[] = [];
      for (const keypair of deleteTargets) {
        const result = await deleteKeypairAction(
          { projectId, regionId },
          keypair.name,
        );
        if (!result.ok) failures.push(`${keypair.name}: ${result.error.message}`);
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "keypairs"],
      });
      if (failures.length) {
        setDeleteError(failures.join(" "));
        return;
      }
      setDeleteTargets([]);
    });
  };

  return (
    <>
      <DataTable
        data={data}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={keypairColumns}
        resourceName={RESOURCE_NAME}
        emptyIcon={KeyRound}
        rowActions={[
          {
            label: "Delete",
            icon: Trash2,
            variant: "destructive",
            onClick: (rows) => {
              setDeleteError(null);
              setDeleteTargets(rows);
            },
          },
        ]}
      />
      <MutationConfirmationDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargets([]);
            setDeleteError(null);
          }
        }}
        title="Delete key pairs?"
        description="Instances that already use these public keys are not changed, but the key pairs cannot be selected for future launches."
        confirmLabel="Delete key pairs"
        pendingLabel="Deleting"
        pending={isPending}
        error={deleteError}
        variant="destructive"
        onConfirm={deleteKeypairs}
      >
        <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
          {deleteTargets.map((keypair) => (
            <div key={keypair.name} className="py-1">{keypair.name}</div>
          ))}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
