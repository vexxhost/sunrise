"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Plus, Trash2 } from "lucide-react";

import { ContainerCreateSheet } from "@/components/KeyManager/ContainerCreateSheet";
import { DataTable } from "@/components/DataTable";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { containersQueryOptions } from "@/hooks/queries/useBarbican";
import { deleteContainerAction } from "@/lib/openstack/barbican-actions";
import { formatAge } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type {
  BarbicanContainer,
  BarbicanPage,
  BarbicanSecret,
} from "@/types/openstack";

export function ContainersClient({
  initiallyCreateOpen,
  initialData,
  projectId,
  regionId,
  secrets,
}: {
  initiallyCreateOpen: boolean;
  initialData: BarbicanPage<BarbicanContainer>;
  projectId: string;
  regionId: string;
  secrets: BarbicanSecret[];
}) {
  const clearCreateIntent = useClearCreateActionIntent();
  const query = useQuery({
    ...containersQueryOptions(regionId, projectId),
    initialData,
    retry: false,
  });
  const [createOpen, setCreateOpen] = useState(initiallyCreateOpen);
  const [deleteTarget, setDeleteTarget] = useState<BarbicanContainer | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope: MutationScope = { projectId, regionId };
  const columns: ColumnDef<BarbicanContainer>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <ResourceLink
          href={`/key-manager/containers/${encodeURIComponent(row.original.id)}`}
        >
          {row.original.name || "Unnamed container"}
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
        idLinkPath: "/key-manager/containers",
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
      meta: { fieldType: "string", visible: true },
    },
    {
      id: "secrets",
      accessorFn: (container) => container.secret_refs.length,
      header: "Secrets",
      meta: { fieldType: "number", visible: true },
    },
    {
      id: "consumers",
      accessorFn: (container) => container.consumers.length,
      header: "Consumers",
      meta: { fieldType: "number", visible: true },
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
          <span className="sr-only">Delete container</span>
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
    const result = await deleteContainerAction(scope, deleteTarget.id);
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
          <h1 className="text-2xl font-semibold">Secret Containers</h1>
          <p className="text-sm text-muted-foreground">
            Typed groups of related Barbican secret references.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create container
        </Button>
      </div>
      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      <DataTable
        columns={columns}
        data={query.data.items}
        refetch={query.refetch}
        isRefetching={query.isRefetching}
        resourceName="secret container"
        emptyIcon={Package}
        getRowId={(container) => container.id}
      />
      <ContainerCreateSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) clearCreateIntent();
        }}
        scope={scope}
        secrets={secrets}
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
        title="Delete secret container?"
        description="The referenced secrets are retained, but applications using this container will lose access."
        confirmLabel="Delete container"
        pendingLabel="Deleting container"
        confirmDisabled={
          confirmation !== (deleteTarget?.name || deleteTarget?.id)
        }
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="space-y-2">
            <Label htmlFor="delete-container-confirmation">
              Type{" "}
              <span className="font-mono">
                {deleteTarget.name || deleteTarget.id}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-container-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </div>
  );
}
