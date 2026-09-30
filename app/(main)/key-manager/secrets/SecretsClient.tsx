"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, Vault } from "lucide-react";

import { SecretCreateSheet } from "@/components/KeyManager/SecretCreateSheet";
import { DataTable } from "@/components/DataTable";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { secretsQueryOptions } from "@/hooks/queries/useBarbican";
import { deleteSecretAction } from "@/lib/openstack/barbican-actions";
import { formatAge, formatUtcTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type { BarbicanPage, BarbicanSecret } from "@/types/openstack";

function expiration(secret: BarbicanSecret) {
  if (!secret.expiration) return "Never";
  return formatUtcTimestamp(secret.expiration);
}

export function SecretsClient({
  initiallyCreateOpen,
  initialData,
  projectId,
  regionId,
}: {
  initiallyCreateOpen: boolean;
  initialData: BarbicanPage<BarbicanSecret>;
  projectId: string;
  regionId: string;
}) {
  const clearCreateIntent = useClearCreateActionIntent();
  const query = useQuery({
    ...secretsQueryOptions(regionId, projectId),
    initialData,
    retry: false,
  });
  const [createOpen, setCreateOpen] = useState(initiallyCreateOpen);
  const [deleteTarget, setDeleteTarget] = useState<BarbicanSecret | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope: MutationScope = { projectId, regionId };
  const columns: ColumnDef<BarbicanSecret>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <ResourceLink
          href={`/key-manager/secrets/${encodeURIComponent(row.original.id)}`}
        >
          {row.original.name || "Unnamed secret"}
        </ResourceLink>
      ),
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "id",
      header: "ID",
      enableHiding: false,
      meta: {
        fieldType: "string",
        visible: true,
        monospace: true,
        idLinkPath: "/key-manager/secrets",
      },
    },
    {
      accessorKey: "secret_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.secret_type}</Badge>
      ),
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "ACTIVE" ? "secondary" : "outline"}
        >
          {row.original.status}
        </Badge>
      ),
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "algorithm",
      header: "Algorithm",
      cell: ({ row }) => row.original.algorithm || "-",
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "expiration",
      header: "Expires",
      cell: ({ row }) => expiration(row.original),
      meta: { fieldType: "string", visible: false },
    },
    {
      accessorKey: "created",
      header: "Age",
      cell: ({ row }) => formatAge(row.original.created),
      meta: { fieldType: "date", dateDisplay: "age", visible: true },
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          title={`Delete ${row.original.name || row.original.id}`}
          onClick={() => {
            setConfirmation("");
            setError(null);
            setDeleteTarget(row.original);
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete secret</span>
        </Button>
      ),
      meta: { fieldType: "string", visible: true },
    },
  ];

  const remove = async () => {
    if (
      !deleteTarget ||
      confirmation !== (deleteTarget.name || deleteTarget.id)
    )
      return;
    setPending(true);
    setError(null);
    const result = await deleteSecretAction(scope, deleteTarget.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDeleteTarget(null);
    setConfirmation("");
    setMessage(result.message);
    await query.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Secrets</h1>
          <p className="text-sm text-muted-foreground">
            Protected values and key material stored by OpenStack Barbican.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create secret
        </Button>
      </div>
      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteTarget ? <MutationAlert>{error}</MutationAlert> : null}
      <DataTable
        columns={columns}
        data={query.data.items}
        refetch={query.refetch}
        isRefetching={query.isRefetching}
        resourceName="secret"
        emptyIcon={Vault}
        getRowId={(secret) => secret.id}
      />
      <SecretCreateSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) clearCreateIntent();
        }}
        scope={scope}
        onCreated={async (success) => {
          setMessage(success);
          await query.refetch();
        }}
      />
      <MutationConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setConfirmation("");
            setError(null);
          }
        }}
        onConfirm={remove}
        pending={pending}
        title="Delete secret?"
        description="Applications using this secret will lose access. Secrets with registered consumers must be detached first."
        confirmLabel="Delete secret"
        pendingLabel="Deleting secret"
        confirmDisabled={
          confirmation !== (deleteTarget?.name || deleteTarget?.id)
        }
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="space-y-2">
            <Label htmlFor="delete-secret-confirmation">
              Type{" "}
              <span className="font-mono">
                {deleteTarget.name || deleteTarget.id}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-secret-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </div>
  );
}
