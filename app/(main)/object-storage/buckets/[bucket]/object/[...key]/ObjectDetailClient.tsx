'use client';

import Link from 'next/link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronRight, Home } from 'lucide-react';
import bytes from 'bytes';
import { objectMetadataQueryOptions } from '@/hooks/queries/useObjects';

interface ObjectDetailClientProps {
  activeProjectId: string;
  bucket: string;
  objectKey: string;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 py-2 border-b last:border-b-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-mono break-all">{value ?? '-'}</div>
    </div>
  );
}

export function ObjectDetailClient({
  activeProjectId,
  bucket,
  objectKey,
}: ObjectDetailClientProps) {
  const { data } = useSuspenseQuery(
    objectMetadataQueryOptions(activeProjectId, bucket, objectKey)
  );

  // Build breadcrumb segments from key
  const segments = objectKey.split('/').filter((s) => s.length > 0);
  const fileName = segments[segments.length - 1] ?? objectKey;
  const parentSegments = segments.slice(0, -1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}`}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          <span>{bucket}</span>
        </Link>
        {parentSegments.map((seg, idx) => {
          const upToHere = parentSegments.slice(0, idx + 1).join('/') + '/';
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
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{fileName}</span>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1 break-all">{fileName}</h2>
        <p className="text-sm text-muted-foreground font-mono break-all">{objectKey}</p>
      </div>

      <div className="rounded-md border p-4">
        <Field label="Bucket" value={data.bucket} />
        <Field label="Key" value={data.key} />
        <Field
          label="Size"
          value={
            data.size !== null
              ? `${bytes(data.size, { unitSeparator: ' ' })} (${data.size} bytes)`
              : null
          }
        />
        <Field label="Last Modified" value={data.lastModified} />
        <Field label="ETag" value={data.etag} />
        <Field label="Content-Type" value={data.contentType} />
        <Field label="Content-Encoding" value={data.contentEncoding} />
        <Field label="Content-Disposition" value={data.contentDisposition} />
        <Field label="Content-Language" value={data.contentLanguage} />
        <Field label="Cache-Control" value={data.cacheControl} />
        <Field label="Storage Class" value={data.storageClass} />
        <Field label="Version ID" value={data.versionId} />
        <Field label="Server-Side Encryption" value={data.serverSideEncryption} />
        <Field label="SSE-KMS Key ID" value={data.sseKmsKeyId} />
      </div>

      {Object.keys(data.metadata).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">User Metadata</h3>
          <div className="rounded-md border p-4">
            {Object.entries(data.metadata).map(([k, v]) => (
              <Field key={k} label={`x-amz-meta-${k}`} value={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
