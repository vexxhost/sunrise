"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { ApplicationCredentialCreateSheet } from "@/components/Identity/ApplicationCredentialCreateSheet";
import { ApplicationCredentialSecretDialog } from "@/components/Identity/ApplicationCredentialSecretDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { deleteApplicationCredentialAction } from "@/lib/openstack/application-credential-actions";
import {
  listApplicationCredentialsAction,
  type ApplicationCredentialPageData,
} from "@/lib/openstack/application-credentials";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type {
  ApplicationCredential,
  CreatedApplicationCredential,
} from "@/types/openstack";

function expirationCell(value: string | null) {
  if (!value) return <span className="text-muted-foreground">Never</span>;
  const date = new Date(normalizeOpenStackTimestamp(value));
  if (Number.isNaN(date.getTime())) return value;
  const expired = date.getTime() <= Date.now();

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span title={date.toISOString()}>{date.toLocaleString()}</span>
      {expired ? <Badge variant="destructive">Expired</Badge> : null}
    </span>
  );
}

export function ApplicationCredentialsClient({
  activeProjectId,
  activeRegionId,
  initiallyCreateOpen = false,
  initialData,
}: {
  activeProjectId: string;
  activeRegionId: string;
  initiallyCreateOpen?: boolean;
  initialData: ApplicationCredentialPageData;
}) {
  const clearCreateActionIntent = useClearCreateActionIntent();
  const { data, isRefetching, refetch } = useQuery({
    queryKey: [activeProjectId, "identity", "application-credentials"],
    queryFn: listApplicationCredentialsAction,
    initialData,
    retry: false,
  });
  const [createOpen, setCreateOpen] = useState(initiallyCreateOpen);
  const [created, setCreated] = useState<CreatedApplicationCredential | null>(
    null,
  );
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<ApplicationCredential | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope: MutationScope = {
    projectId: activeProjectId,
    regionId: activeRegionId,
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting || deleteConfirmation !== deleteTarget.name) {
      return;
    }
    setDeleting(true);
    setError(null);
    const result = await deleteApplicationCredentialAction(
      scope,
      deleteTarget.id,
    );
    setDeleting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setDeleteTarget(null);
    setDeleteConfirmation("");
    setMessage(result.message);
    await refetch();
  };

  const columns: ColumnDef<ApplicationCredential>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <ResourceLink
          href={`/identity/application-credentials/${encodeURIComponent(row.original.id)}`}
        >
          {row.original.name}
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
        idLinkPath: "/identity/application-credentials",
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => row.original.description || "-",
      meta: { fieldType: "string", visible: true },
    },
    {
      id: "roles",
      accessorFn: (credential) =>
        credential.roles.map(({ name }) => name).join(", "),
      header: "Roles",
      cell: ({ row }) =>
        row.original.roles.length
          ? row.original.roles.map(({ name }) => name).join(", ")
          : "-",
      meta: { fieldType: "string", visible: true },
    },
    {
      id: "accessRules",
      accessorFn: (credential) => credential.access_rules.length,
      header: "Access Rules",
      cell: ({ row }) => String(row.original.access_rules.length),
      meta: { fieldType: "number", visible: true },
    },
    {
      accessorKey: "expires_at",
      header: "Expires",
      cell: ({ row }) => expirationCell(row.original.expires_at),
      meta: { fieldType: "date", visible: true },
    },
    {
      accessorKey: "unrestricted",
      header: "Delegation",
      cell: ({ row }) => (
        <Badge variant={row.original.unrestricted ? "destructive" : "outline"}>
          {row.original.unrestricted ? "Allowed" : "Blocked"}
        </Badge>
      ),
      meta: { fieldType: "boolean", visible: false },
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
          title={`Delete ${row.original.name}`}
          onClick={() => {
            setError(null);
            setDeleteConfirmation("");
            setDeleteTarget(row.original);
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete application credential</span>
        </Button>
      ),
      meta: { fieldType: "string", visible: true },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Application Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Create project-scoped credentials for automation without sharing
            your interactive sign-in.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="size-4" />
          Create credential
        </Button>
      </div>

      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteTarget ? <MutationAlert>{error}</MutationAlert> : null}

      <DataTable
        columns={columns}
        data={data.credentials}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="application credential"
        emptyIcon={KeyRound}
        getRowId={(credential) => credential.id}
      />

      <ApplicationCredentialCreateSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) clearCreateActionIntent();
        }}
        roles={data.roles}
        serviceTypes={data.serviceTypes}
        scope={scope}
        onCreated={async (credential, successMessage) => {
          await refetch();
          setCreatedMessage(successMessage);
          setCreated(credential);
        }}
      />

      <ApplicationCredentialSecretDialog
        credential={created}
        authUrl={data.authUrl}
        regionId={activeRegionId}
        onClose={() => {
          setCreated(null);
          setMessage(createdMessage);
          setCreatedMessage(null);
        }}
      />

      <MutationConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmation("");
            setError(null);
          }
        }}
        onConfirm={handleDelete}
        pending={deleting}
        title="Delete application credential?"
        description="Workloads using this credential will immediately lose access. This cannot be undone."
        confirmLabel="Delete credential"
        pendingLabel="Deleting credential"
        confirmDisabled={deleteConfirmation !== deleteTarget?.name}
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="space-y-2">
            <Label htmlFor="delete-application-credential-confirmation">
              Type <span className="font-mono">{deleteTarget.name}</span> to
              confirm
            </Label>
            <Input
              id="delete-application-credential-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </div>
  );
}
