import type { ReactNode } from 'react';
import bytes from 'bytes';

export interface ObjectMetadataDetailsData {
  bucket: string;
  key: string;
  size: number | null;
  lastModified: string | null;
  etag: string | null;
  contentType: string | null;
  contentEncoding: string | null;
  contentDisposition: string | null;
  contentLanguage: string | null;
  cacheControl: string | null;
  storageClass: string | null;
  versionId: string | null;
  serverSideEncryption: string | null;
  sseKmsKeyId: string | null;
  metadata: Record<string, string>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 border-b py-2 last:border-b-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-sm">{value ?? '-'}</div>
    </div>
  );
}

export function ObjectMetadataDetails({
  data,
}: {
  data: ObjectMetadataDetailsData;
}) {
  return (
    <>
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
        <Field
          label="Server-Side Encryption"
          value={data.serverSideEncryption}
        />
        <Field label="SSE-KMS Key ID" value={data.sseKmsKeyId} />
      </div>

      {Object.keys(data.metadata).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">User Metadata</h3>
          <div className="rounded-md border p-4">
            {Object.entries(data.metadata).map(([key, value]) => (
              <Field key={key} label={`x-amz-meta-${key}`} value={value} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
