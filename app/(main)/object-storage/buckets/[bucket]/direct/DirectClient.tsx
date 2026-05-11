'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ListObjectsV2Command,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  Folder,
  FileText,
  ChevronRight,
  Home,
  AlertTriangle,
  RefreshCcw,
} from 'lucide-react';
import bytes from 'bytes';
import { Button } from '@/components/ui/button';
import { getStsCredentialsForBrowser } from '@/lib/s3/browser-creds';
import { makeBrowserS3Client } from '@/lib/s3/browser-client';

interface DirectClientProps {
  bucket: string;
}

type ListEntry =
  | { kind: 'folder'; name: string; fullPath: string }
  | {
      kind: 'object';
      name: string;
      fullPath: string;
      size: number | null;
      lastModified: string | null;
    };

function basenameOf(prefix: string, key: string) {
  const tail = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return tail.replace(/\/$/, '');
}

export function DirectClient({ bucket }: DirectClientProps) {
  const searchParams = useSearchParams();
  const prefix = searchParams.get('prefix') ?? '';
  const inspectKey = searchParams.get('inspect') ?? '';

  const [s3, setS3] = useState<S3Client | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);

  // Fetch creds once on mount; redirect to OIDC if missing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getStsCredentialsForBrowser();
      if (cancelled) return;
      if (!res.ok) {
        if (res.needsAuth) {
          window.location.href = '/object-storage/auth/login';
          return;
        }
        setCredsError(res.error);
        return;
      }
      setS3(makeBrowserS3Client(res.credentials, res.endpoint, res.region));
      setEndpoint(res.endpoint);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const listQuery = useQuery({
    queryKey: ['s3-direct', 'objects', bucket, prefix],
    enabled: !!s3,
    retry: false,
    queryFn: async () => {
      const res = await s3!.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || undefined,
          Delimiter: '/',
          MaxKeys: 1000,
        })
      );
      const objects = (res.Contents ?? [])
        .filter((o) => o.Key && o.Key !== prefix)
        .map<ListEntry>((o) => ({
          kind: 'object',
          name: basenameOf(prefix, o.Key!),
          fullPath: o.Key!,
          size: typeof o.Size === 'number' ? o.Size : null,
          lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        }));
      const folders = (res.CommonPrefixes ?? [])
        .filter((p) => !!p.Prefix)
        .map<ListEntry>((p) => ({
          kind: 'folder',
          name: basenameOf(prefix, p.Prefix!),
          fullPath: p.Prefix!,
        }));
      return {
        entries: [...folders, ...objects],
        isTruncated: !!res.IsTruncated,
      };
    },
  });

  const headQuery = useQuery({
    queryKey: ['s3-direct', 'head', bucket, inspectKey],
    enabled: !!s3 && !!inspectKey,
    retry: false,
    queryFn: async () => {
      const res = await s3!.send(
        new HeadObjectCommand({ Bucket: bucket, Key: inspectKey })
      );
      return res;
    },
  });

  const segments = useMemo(
    () =>
      prefix
        .replace(/\/$/, '')
        .split('/')
        .filter((s) => s.length > 0),
    [prefix]
  );

  if (credsError) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
        Failed to obtain STS credentials: {credsError}
      </div>
    );
  }

  if (!s3) {
    return <div className="text-sm text-muted-foreground">Acquiring credentials…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
        <div className="font-medium">Direct browser mode</div>
        <div className="text-muted-foreground">
          All S3 calls below are made from your browser straight to{' '}
          <code>{endpoint || 'the S3 endpoint'}</code>.
          Requires CORS to be configured on the bucket / gateway. Open DevTools
          → Network to inspect signed requests.
        </div>
      </div>

      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}/direct`}
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
                )}/direct?prefix=${encodeURIComponent(upToHere)}`}
                className="hover:text-foreground"
              >
                {seg}
              </Link>
            </span>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Objects</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => listQuery.refetch()}
          disabled={listQuery.isFetching}
        >
          <RefreshCcw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {listQuery.error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">List failed</div>
            <div className="font-mono text-xs break-all">
              {(listQuery.error as Error).message}
            </div>
            <div className="text-muted-foreground mt-1">
              If this is a CORS error, open DevTools → Network for details.
            </div>
          </div>
        </div>
      )}

      {listQuery.data && (
        <div className="rounded-md border divide-y">
          {listQuery.data.entries.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              No objects or folders.
            </div>
          )}
          {listQuery.data.entries.map((e) => {
            if (e.kind === 'folder') {
              return (
                <Link
                  key={e.fullPath}
                  href={`/object-storage/buckets/${encodeURIComponent(
                    bucket
                  )}/direct?prefix=${encodeURIComponent(e.fullPath)}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm"
                >
                  <Folder className="h-4 w-4" />
                  <span className="font-mono">{e.name}/</span>
                </Link>
              );
            }
            const params = new URLSearchParams();
            if (prefix) params.set('prefix', prefix);
            params.set('inspect', e.fullPath);
            return (
              <Link
                key={e.fullPath}
                href={`/object-storage/buckets/${encodeURIComponent(
                  bucket
                )}/direct?${params.toString()}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-accent text-sm"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-mono">{e.name}</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>
                    {e.size !== null
                      ? bytes(e.size, { unitSeparator: ' ' })
                      : '-'}
                  </span>
                  <span className="text-xs">{e.lastModified ?? '-'}</span>
                </div>
              </Link>
            );
          })}
          {listQuery.data.isTruncated && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Truncated at 1000 entries.
            </div>
          )}
        </div>
      )}

      {inspectKey && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Object: {inspectKey}</h2>
          {headQuery.error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm font-mono break-all">
              {(headQuery.error as Error).message}
            </div>
          )}
          {headQuery.data && (
            <pre className="rounded-md border p-3 text-xs overflow-auto bg-muted/40">
              {JSON.stringify(
                {
                  ContentLength: headQuery.data.ContentLength,
                  ContentType: headQuery.data.ContentType,
                  ETag: headQuery.data.ETag,
                  LastModified: headQuery.data.LastModified,
                  StorageClass: headQuery.data.StorageClass,
                  VersionId: headQuery.data.VersionId,
                  Metadata: headQuery.data.Metadata,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
