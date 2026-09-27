'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { FadedText } from '@/components/FadedText';
import { MutationAlert } from '@/components/mutations/MutationAlert';
import { MutationConfirmationDialog } from '@/components/mutations/MutationConfirmationDialog';
import { IamRoleCreateSheet } from '@/components/object-storage/IamRoleCreateSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClearCreateActionIntent } from '@/hooks/useClearCreateActionIntent';
import type { MutationScope } from '@/lib/mutations';
import { RoleDetailsDialog } from '../RoleDetailsDialog';
import {
  deleteIamRole,
  listRoles,
  type IamRoleSummary,
} from '@/lib/s3/role-actions';

type RolesData = {
  roles: IamRoleSummary[];
  activeRoleArn: string;
  accessDenied: boolean;
  denialRequestId?: string;
};

function startObjectStorageLogin() {
  window.location.assign(
    new URL('/object-storage/auth/login', window.location.origin).toString(),
  );
}

function formatSessionDuration(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

export function RolesClient({
  activeProjectId,
  activeRegionId,
  initiallyCreateOpen = false,
  initialData,
}: {
  activeProjectId: string;
  activeRegionId: string;
  initiallyCreateOpen?: boolean;
  initialData: RolesData;
}) {
  const clearCreateActionIntent = useClearCreateActionIntent();
  const { data = initialData, refetch, isRefetching } = useQuery({
    queryKey: ['s3', activeProjectId, 'roles'],
    queryFn: async () => {
      const result = await listRoles();
      if (!result.ok) {
        if (result.needsAuth) {
          startObjectStorageLogin();
          throw new Error('S3 authentication required');
        }
        throw new Error(result.error);
      }
      return {
        roles: result.roles,
        activeRoleArn: result.activeRoleArn,
        accessDenied: result.accessDenied,
        denialRequestId: result.denialRequestId,
      };
    },
    initialData,
    retry: false,
  });
  const [createOpen, setCreateOpen] = useState(initiallyCreateOpen);
  const [deleteTarget, setDeleteTarget] = useState<IamRoleSummary | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope: MutationScope = {
    projectId: activeProjectId,
    regionId: activeRegionId,
  };

  const handleCreateOpenChange = (nextOpen: boolean) => {
    setCreateOpen(nextOpen);
    if (!nextOpen) clearCreateActionIntent();
  };

  const handleChanged = async (successMessage?: string) => {
    if (successMessage) setMessage(successMessage);
    setError(null);
    await refetch();
  };

  const handleDelete = async () => {
    if (
      !deleteTarget ||
      deleting ||
      deleteConfirmation !== deleteTarget.name
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    const result = await deleteIamRole(scope, deleteTarget.name);
    setDeleting(false);
    if (!result.ok) {
      if (result.error.code === 'authentication-required') {
        startObjectStorageLogin();
        return;
      }
      setError(result.error.message);
      return;
    }
    setDeleteTarget(null);
    setDeleteConfirmation('');
    setMessage(result.message);
    await refetch();
  };

  const roleDialog = (role: IamRoleSummary, trigger: ReactNode) => (
    <RoleDetailsDialog
      roleName={role.name}
      roleArn={role.arn}
      scope={scope}
      trigger={trigger}
      onChanged={() => handleChanged()}
    />
  );

  const columns: ColumnDef<IamRoleSummary>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableHiding: false,
      cell: ({ row }) =>
        roleDialog(
          row.original,
          <button
            type="button"
            className="flex max-w-72 items-center gap-2 text-left text-primary underline-offset-2 hover:underline"
            title={row.original.name}
          >
            <span className="truncate">{row.original.name}</span>
            {row.original.isActive ? (
              <Badge variant="secondary" className="shrink-0">
                Current
              </Badge>
            ) : null}
          </button>,
        ),
      meta: { fieldType: 'string', visible: true },
    },
    {
      accessorKey: 'arn',
      header: 'ARN',
      cell: ({ row }) =>
        roleDialog(
          row.original,
          <button
            type="button"
            className="block max-w-96 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={`Open ${row.original.arn}`}
          >
            <FadedText
              value={row.original.arn}
              className="max-w-96 font-mono text-sm"
            />
          </button>,
        ),
      meta: { fieldType: 'string', visible: true, monospace: true },
    },
    {
      accessorKey: 'path',
      header: 'Path',
      meta: { fieldType: 'string', visible: true, monospace: true },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.original.description ?? '-',
      meta: { fieldType: 'string', visible: false },
    },
    {
      accessorKey: 'createdAt',
      header: 'Age',
      meta: { fieldType: 'date', dateDisplay: 'age', visible: true },
    },
    {
      accessorKey: 'maxSessionDuration',
      header: 'Max Session Duration',
      cell: ({ row }) => formatSessionDuration(row.original.maxSessionDuration),
      meta: { fieldType: 'number', visible: false },
    },
    {
      accessorKey: 'id',
      header: 'Role ID',
      cell: ({ row }) => row.original.id ?? '-',
      meta: { fieldType: 'string', visible: false, monospace: true },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          title={
            row.original.isActive
              ? 'The current access role cannot be deleted'
              : `Delete ${row.original.name}`
          }
          disabled={row.original.isActive}
          onClick={() => {
            setError(null);
            setDeleteConfirmation('');
            setDeleteTarget(row.original);
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete role</span>
        </Button>
      ),
      meta: { fieldType: 'string', visible: true },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">
            Manage assumable roles and permissions in the active RGW account.
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
          Create role
        </Button>
      </div>

      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteTarget ? <MutationAlert>{error}</MutationAlert> : null}

      {data.accessDenied && (
        <div className="flex gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <div>
            <div className="font-medium">Role listing not permitted</div>
            <div className="text-muted-foreground">
              RGW denied <code>iam:ListRoles</code> for the active role.
            </div>
            {data.denialRequestId && (
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                Request ID: {data.denialRequestId}
              </div>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data.roles}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="role"
        emptyIcon={ShieldCheck}
      />

      <IamRoleCreateSheet
        activeRoleArn={data.activeRoleArn}
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        scope={scope}
        onCreated={(successMessage) => handleChanged(successMessage)}
      />

      <MutationConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
            setDeleteConfirmation('');
            setError(null);
          }
        }}
        onConfirm={handleDelete}
        pending={deleting}
        title="Delete IAM role?"
        description="The role must have no inline or attached policies. Deletion cannot be undone."
        confirmLabel="Delete role"
        pendingLabel="Deleting role"
        confirmDisabled={deleteConfirmation !== deleteTarget?.name}
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="space-y-2">
            <Label htmlFor="delete-iam-role-confirmation">
              Type <span className="font-mono">{deleteTarget.name}</span> to
              confirm
            </Label>
            <Input
              id="delete-iam-role-confirmation"
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
