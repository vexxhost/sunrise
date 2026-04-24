'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Database, AlertTriangle, ArrowRight } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { bucketsQueryOptions } from '@/hooks/queries/useBuckets';
import type { Bucket } from '@/lib/s3/actions';

const columns: ColumnDef<Bucket>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
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
];

export function BucketsClient() {
  const router = useRouter();
  const { data, refetch, isRefetching } = useSuspenseQuery(bucketsQueryOptions());
  const [bucketName, setBucketName] = useState('');

  const open = () => {
    const trimmed = bucketName.trim();
    if (!trimmed) return;
    router.push(`/object-storage/buckets/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open();
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1 max-w-md">
          <label className="block text-sm font-medium mb-1">
            Open bucket by name
          </label>
          <Input
            placeholder="my-bucket"
            value={bucketName}
            onChange={(e) => setBucketName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={!bucketName.trim()}>
          Open
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </form>

      {data.accessDenied && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 flex gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Bucket listing not permitted</div>
            <div className="text-muted-foreground">
              Your role does not have <code>s3:ListAllMyBuckets</code>. You can
              still access individual buckets by name above.
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data.buckets}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="bucket"
        emptyIcon={Database}
      />
    </div>
  );
}
