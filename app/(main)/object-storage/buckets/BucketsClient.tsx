'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Database, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { MutationAlert } from '@/components/mutations/MutationAlert';
import { MutationConfirmationDialog } from '@/components/mutations/MutationConfirmationDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { bucketsQueryOptions } from '@/hooks/queries/useBuckets';
import type { Bucket } from '@/lib/s3/actions';
import { createBucket, deleteBucket } from '@/lib/s3/bucket-actions';
import { validateBucketName } from '@/lib/s3/bucket-validation';

type BucketsData = {
  buckets: Bucket[];
  accessDenied: boolean;
};

function startObjectStorageLogin() {
  window.location.assign(
    new URL('/object-storage/auth/login', window.location.origin).toString(),
  );
}

export function BucketsClient({
  activeProjectId,
  activeRegionId,
  initialData,
}: {
  activeProjectId: string;
  activeRegionId: string;
  initialData: BucketsData;
}) {
  const router = useRouter();
  const { data = initialData, refetch, isRefetching } = useQuery({
    ...bucketsQueryOptions(activeProjectId),
    initialData,
  });
  const [bucketName, setBucketName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bucket | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = { projectId: activeProjectId, regionId: activeRegionId };
  const createValidation = createName ? validateBucketName(createName) : null;

  const columns: ColumnDef<Bucket>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(row.original.name)}`}
          className="text-primary hover:underline"
        >
          {row.original.name}
        </Link>
      ),
      meta: { fieldType: 'string', visible: true, monospace: true },
    },
    {
      accessorKey: 'creationDate',
      header: 'Created At',
      cell: ({ row }) => row.original.creationDate ?? '-',
      meta: { fieldType: 'date', visible: true },
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
          title={`Delete ${row.original.name}`}
          onClick={() => {
            setError(null);
            setDeleteTarget(row.original);
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete bucket</span>
        </Button>
      ),
      meta: { fieldType: 'string', visible: true },
    },
  ];

  const open = () => {
    const trimmed = bucketName.trim();
    if (!trimmed) return;
    router.push(`/object-storage/buckets/${encodeURIComponent(trimmed)}`);
  };

  const handleCreate = async () => {
    if (creating || !createName.trim() || createValidation) return;
    setCreating(true);
    setError(null);
    setMessage(null);
    const result = await createBucket(scope, createName);
    setCreating(false);
    if (!result.ok) {
      if (result.error.code === 'authentication-required') {
        startObjectStorageLogin();
        return;
      }
      setError(result.error.message);
      return;
    }
    setCreateOpen(false);
    setCreateName('');
    setMessage(result.message);
    await refetch();
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    const result = await deleteBucket(scope, deleteTarget.name);
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
    setMessage(result.message);
    await refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Buckets</h1>
          <p className="text-sm text-muted-foreground">
            Buckets listed for the current Object Storage role.
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
          Create bucket
        </Button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
        className="flex flex-wrap items-end gap-2 border-b pb-4"
      >
        <div className="min-w-64 max-w-md flex-1 space-y-1.5">
          <Label htmlFor="open-bucket-name">Open bucket by name</Label>
          <Input
            id="open-bucket-name"
            placeholder="my-bucket"
            value={bucketName}
            onChange={(event) => setBucketName(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" disabled={!bucketName.trim()}>
          Open
          <ArrowRight className="size-4" />
        </Button>
      </form>

      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteTarget && !createOpen ? (
        <MutationAlert>{error}</MutationAlert>
      ) : null}

      {data.accessDenied && (
        <MutationAlert variant="warning" title="Bucket listing not permitted">
          Your role does not have <code>s3:ListAllMyBuckets</code>. You can still
          open any bucket that the role can access by entering its name above.
        </MutationAlert>
      )}

      <DataTable
        columns={columns}
        data={data.buckets}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="bucket"
        emptyIcon={Database}
      />

      <Dialog
        open={createOpen}
        onOpenChange={(nextOpen) => {
          if (creating) return;
          setCreateOpen(nextOpen);
          if (!nextOpen) {
            setCreateName('');
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create bucket</DialogTitle>
            <DialogDescription>
              Bucket names must be unique in this RGW namespace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="create-bucket-name">Bucket name</Label>
            <Input
              id="create-bucket-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="project-artifacts"
              autoComplete="off"
              aria-invalid={createValidation ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              3-63 lowercase letters, numbers, periods, or hyphens.
            </p>
          </div>
          {createValidation ? (
            <MutationAlert>{createValidation}</MutationAlert>
          ) : null}
          {createOpen && error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => {
                setCreateOpen(false);
                setCreateName('');
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !createName.trim() || !!createValidation}
              onClick={() => void handleCreate()}
            >
              {creating ? <Spinner /> : <Plus className="size-4" />}
              {creating ? 'Creating' : 'Create bucket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        pending={deleting}
        title="Delete bucket?"
        description="The bucket must be empty, including all object versions. This action cannot be undone."
        confirmLabel="Delete bucket"
        pendingLabel="Deleting bucket"
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="rounded-md border px-3 py-2 font-mono text-sm break-all">
            {deleteTarget.name}
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </div>
  );
}
