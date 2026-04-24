'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Folder, FileText, ChevronRight, Home, AlertTriangle } from 'lucide-react';
import bytes from 'bytes';
import { DataTable } from '@/components/DataTable';
import { objectsQueryOptions } from '@/hooks/queries/useObjects';

type Row =
  | { kind: 'folder'; name: string; fullPath: string }
  | {
      kind: 'object';
      name: string;
      fullPath: string;
      size: number | null;
      lastModified: string | null;
      storageClass: string | null;
      etag: string | null;
    };

function basenameOf(prefix: string, key: string) {
  const tail = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return tail.replace(/\/$/, '');
}

interface ObjectsClientProps {
  bucket: string;
}

export function ObjectsClient({ bucket }: ObjectsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefix = searchParams.get('prefix') ?? '';

  const { data, refetch, isRefetching } = useSuspenseQuery(
    objectsQueryOptions(bucket, prefix)
  );

  const rows: Row[] = [
    ...data.folders.map<Row>((f) => ({
      kind: 'folder',
      name: basenameOf(prefix, f.prefix),
      fullPath: f.prefix,
    })),
    ...data.objects.map<Row>((o) => ({
      kind: 'object',
      name: basenameOf(prefix, o.key),
      fullPath: o.key,
      size: o.size,
      lastModified: o.lastModified,
      storageClass: o.storageClass,
      etag: o.etag,
    })),
  ];

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'folder') {
          const params = new URLSearchParams();
          params.set('prefix', r.fullPath);
          return (
            <Link
              href={`?${params.toString()}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Folder className="h-4 w-4" />
              <span>{r.name}/</span>
            </Link>
          );
        }
        return (
          <Link
            href={`/object-storage/buckets/${encodeURIComponent(
              bucket
            )}/object/${encodeURIComponent(r.fullPath)}`}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <FileText className="h-4 w-4" />
            <span>{r.name}</span>
          </Link>
        );
      },
      meta: { fieldType: 'string', visible: true, monospace: true },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'folder' || r.size === null) return '-';
        return bytes(r.size, { unitSeparator: ' ' });
      },
      meta: { fieldType: 'number', visible: true },
    },
    {
      accessorKey: 'lastModified',
      header: 'Last Modified',
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'folder') return '-';
        return r.lastModified ?? '-';
      },
      meta: { fieldType: 'date', visible: true },
    },
    {
      accessorKey: 'storageClass',
      header: 'Storage Class',
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === 'object' ? r.storageClass ?? '-' : '-';
      },
      meta: { fieldType: 'string', visible: false },
    },
    {
      accessorKey: 'etag',
      header: 'ETag',
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === 'object' ? r.etag ?? '-' : '-';
      },
      meta: { fieldType: 'string', visible: false, monospace: true },
    },
  ];

  // Build prefix breadcrumb segments
  const segments = prefix
    .replace(/\/$/, '')
    .split('/')
    .filter((s) => s.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <Link
            href={`/object-storage/buckets/${encodeURIComponent(bucket)}`}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            <span>{bucket}</span>
          </Link>
          {segments.map((seg, idx) => {
            const upToHere = segments.slice(0, idx + 1).join('/') + '/';
            return (
              <span key={idx} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link
                  href={`/object-storage/buckets/${encodeURIComponent(
                    bucket
                  )}?prefix=${encodeURIComponent(upToHere)}`}
                  className="hover:text-foreground"
                >
                  {seg}
                </Link>
              </span>
            );
          })}
        </div>
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}/direct${
            prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
          }`}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Try direct browser mode →
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="object"
        emptyIcon={Folder}
      />

      {data.accessDenied && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 flex gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Access denied</div>
            <div className="text-muted-foreground">
              Your role does not have permission to list objects in
              <code> {bucket}</code>{prefix ? <> at prefix <code>{prefix}</code></> : null}.
            </div>
          </div>
        </div>
      )}

      {data.isTruncated && (
        <p className="text-sm text-muted-foreground">
          Listing truncated at 1000 entries. Pagination not yet implemented.
        </p>
      )}
    </div>
  );
}
