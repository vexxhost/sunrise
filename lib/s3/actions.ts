'use server';

import {
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetBucketLocationCommand,
} from '@aws-sdk/client-s3';
import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

export type Bucket = {
  name: string;
  creationDate: string | null;
};

export type ListBucketsResult =
  | {
      ok: true;
      buckets: Bucket[];
      owner: { id?: string; displayName?: string };
      accessDenied?: boolean;
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

function describeAwsError(e: unknown): string {
  if (e instanceof Error) {
    const anyErr = e as any;
    const name = anyErr.name || 'Error';
    const code = anyErr.Code || anyErr.$metadata?.httpStatusCode;
    const msg = anyErr.message || String(e);
    return `${name}${code ? ` (${code})` : ''}: ${msg}`;
  }
  return String(e);
}

function isAccessDenied(e: unknown): boolean {
  const anyErr = e as any;
  const name = anyErr?.name || anyErr?.Code;
  const status = anyErr?.$metadata?.httpStatusCode;
  return name === 'AccessDenied' || name === 'AccessDeniedException' || status === 403;
}

export async function listBuckets(): Promise<ListBucketsResult> {
  console.log('[s3/listBuckets] called');
  let client;
  try {
    client = await getS3Client();
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/listBuckets] FAILED to acquire S3 client:', detail);
    return { ok: false, needsAuth: false, error: detail };
  }

  try {
    const res = await client.send(new ListBucketsCommand({}));
    return {
      ok: true,
      buckets: (res.Buckets ?? []).map((b) => ({
        name: b.Name ?? '',
        creationDate: b.CreationDate ? b.CreationDate.toISOString() : null,
      })),
      owner: { id: res.Owner?.ID, displayName: res.Owner?.DisplayName },
    };
  } catch (e) {
    if (isAccessDenied(e)) {
      console.warn('[s3/listBuckets] access denied; returning empty list');
      return { ok: true, buckets: [], owner: {}, accessDenied: true };
    }
    const detail = describeAwsError(e);
    console.error('[s3/listBuckets] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

// ---------------- Objects ----------------

export type S3Object = {
  key: string;
  size: number | null;
  lastModified: string | null;
  etag: string | null;
  storageClass: string | null;
};

export type S3CommonPrefix = {
  prefix: string;
};

export type ListObjectsResult =
  | {
      ok: true;
      bucket: string;
      prefix: string;
      delimiter: string;
      objects: S3Object[];
      folders: S3CommonPrefix[];
      isTruncated: boolean;
      nextContinuationToken: string | null;
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export async function listObjects(
  bucket: string,
  prefix = '',
  continuationToken?: string
): Promise<ListObjectsResult> {
  console.log('[s3/listObjects]', { bucket, prefix, continuationToken });
  try {
    const client = await getS3Client();
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        Delimiter: '/',
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    const objects: S3Object[] = (res.Contents ?? [])
      // Skip the "folder placeholder" entry equal to prefix
      .filter((o) => o.Key && o.Key !== prefix)
      .map((o) => ({
        key: o.Key!,
        size: typeof o.Size === 'number' ? o.Size : null,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        etag: o.ETag ?? null,
        storageClass: o.StorageClass ?? null,
      }));
    const folders: S3CommonPrefix[] = (res.CommonPrefixes ?? [])
      .filter((p) => !!p.Prefix)
      .map((p) => ({ prefix: p.Prefix! }));
    return {
      ok: true,
      bucket,
      prefix,
      delimiter: '/',
      objects,
      folders,
      isTruncated: !!res.IsTruncated,
      nextContinuationToken: res.NextContinuationToken ?? null,
    };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/listObjects] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export type S3ObjectMetadata = {
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
};

export type HeadObjectResult =
  | { ok: true; data: S3ObjectMetadata }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export async function headObject(
  bucket: string,
  key: string
): Promise<HeadObjectResult> {
  console.log('[s3/headObject]', { bucket, key });
  try {
    const client = await getS3Client();
    const res = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      ok: true,
      data: {
        bucket,
        key,
        size: typeof res.ContentLength === 'number' ? res.ContentLength : null,
        lastModified: res.LastModified ? res.LastModified.toISOString() : null,
        etag: res.ETag ?? null,
        contentType: res.ContentType ?? null,
        contentEncoding: res.ContentEncoding ?? null,
        contentDisposition: res.ContentDisposition ?? null,
        contentLanguage: res.ContentLanguage ?? null,
        cacheControl: res.CacheControl ?? null,
        storageClass: res.StorageClass ?? null,
        versionId: res.VersionId ?? null,
        serverSideEncryption: res.ServerSideEncryption ?? null,
        sseKmsKeyId: res.SSEKMSKeyId ?? null,
        metadata: res.Metadata ?? {},
      },
    };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/headObject] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export type BucketInfoResult =
  | { ok: true; bucket: string; locationConstraint: string | null }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export async function getBucketInfo(bucket: string): Promise<BucketInfoResult> {
  console.log('[s3/getBucketInfo]', { bucket });
  try {
    const client = await getS3Client();
    const res = await client.send(
      new GetBucketLocationCommand({ Bucket: bucket })
    );
    return {
      ok: true,
      bucket,
      locationConstraint: res.LocationConstraint ?? null,
    };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/getBucketInfo] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}
