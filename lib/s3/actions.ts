'use server';

import {
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  GetBucketPolicyCommand,
  GetBucketLocationCommand,
} from '@aws-sdk/client-s3';
import { Buffer } from 'node:buffer';
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

function isNoSuchBucketPolicy(e: unknown): boolean {
  const anyErr = e as any;
  const name = anyErr?.name || anyErr?.Code;
  const status = anyErr?.$metadata?.httpStatusCode;
  return name === 'NoSuchBucketPolicy' || status === 404;
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
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
      accessDenied?: boolean;
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
    if (isAccessDenied(e)) {
      console.warn('[s3/listObjects] access denied for', bucket, prefix);
      return {
        ok: true,
        bucket,
        prefix,
        delimiter: '/',
        objects: [],
        folders: [],
        isTruncated: false,
        nextContinuationToken: null,
        accessDenied: true,
      };
    }
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

export type CreateFolderResult =
  | { ok: true; key: string }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export async function createFolder(
  bucket: string,
  prefix: string,
  folderName: string
): Promise<CreateFolderResult> {
  const name = folderName.trim().replace(/^\/+|\/+$/g, '');
  if (!bucket) {
    return { ok: false, needsAuth: false, error: 'Missing bucket name' };
  }
  if (!name) {
    return { ok: false, needsAuth: false, error: 'Missing folder name' };
  }

  const key = normalizeObjectKey(`${normalizePrefix(prefix)}${name}/`);

  try {
    const client = await getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.alloc(0),
      })
    );
    return { ok: true, key };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/createFolder] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export type SizeSelectionEntry =
  | { kind: 'folder'; fullPath: string }
  | { kind: 'object'; fullPath: string; size: number | null };

export type RemoveSelectionEntry =
  | { kind: 'folder'; fullPath: string }
  | { kind: 'object'; fullPath: string };

export type CalculateSelectionSizeResult =
  | {
      ok: true;
      totalBytes: number;
      objectCount: number;
      folderCount: number;
      scannedPrefixes: string[];
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export async function calculateSelectionSize(
  bucket: string,
  entries: SizeSelectionEntry[]
): Promise<CalculateSelectionSizeResult> {
  if (!bucket) {
    return { ok: false, needsAuth: false, error: 'Missing bucket name' };
  }
  if (entries.length === 0) {
    return { ok: false, needsAuth: false, error: 'No objects selected' };
  }

  try {
    const client = await getS3Client();
    const folderPrefixes = Array.from(
      new Set(
        entries
          .filter((entry): entry is Extract<SizeSelectionEntry, { kind: 'folder' }> => {
            return entry.kind === 'folder';
          })
          .map((entry) => normalizePrefix(entry.fullPath))
          .filter(Boolean)
      )
    )
      .sort((a, b) => a.length - b.length)
      .filter((prefix, index, prefixes) => {
        return !prefixes
          .slice(0, index)
          .some((parentPrefix) => prefix.startsWith(parentPrefix));
      });

    let totalBytes = 0;
    let objectCount = 0;
    const countedKeys = new Set<string>();

    for (const prefix of folderPrefixes) {
      let continuationToken: string | undefined;
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          })
        );

        for (const object of res.Contents ?? []) {
          if (!object.Key || countedKeys.has(object.Key)) continue;
          countedKeys.add(object.Key);
          totalBytes += object.Size ?? 0;
          objectCount += 1;
        }

        continuationToken = res.IsTruncated
          ? res.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }

    for (const entry of entries) {
      if (entry.kind !== 'object') continue;
      const key = normalizeObjectKey(entry.fullPath);
      if (!key || countedKeys.has(key)) continue;
      if (folderPrefixes.some((prefix) => key.startsWith(prefix))) continue;

      countedKeys.add(key);
      if (typeof entry.size === 'number') {
        totalBytes += entry.size;
      } else {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key })
        );
        totalBytes += head.ContentLength ?? 0;
      }
      objectCount += 1;
    }

    return {
      ok: true,
      totalBytes,
      objectCount,
      folderCount: folderPrefixes.length,
      scannedPrefixes: folderPrefixes,
    };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/calculateSelectionSize] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export type RemoveSelectionResult =
  | { ok: true; deleted: number; errors: { key: string; error: string }[] }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

async function collectSelectionKeys(
  client: Awaited<ReturnType<typeof getS3Client>>,
  bucket: string,
  entries: RemoveSelectionEntry[]
) {
  const keys = new Set<string>();
  const folderPrefixes = Array.from(
    new Set(
      entries
        .filter((entry): entry is Extract<RemoveSelectionEntry, { kind: 'folder' }> => {
          return entry.kind === 'folder';
        })
        .map((entry) => normalizePrefix(entry.fullPath))
        .filter(Boolean)
    )
  )
    .sort((a, b) => a.length - b.length)
    .filter((prefix, index, prefixes) => {
      return !prefixes
        .slice(0, index)
        .some((parentPrefix) => prefix.startsWith(parentPrefix));
    });

  for (const entry of entries) {
    if (entry.kind !== 'object') continue;
    const key = normalizeObjectKey(entry.fullPath);
    if (!key) continue;
    if (folderPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    keys.add(key);
  }

  for (const prefix of folderPrefixes) {
    keys.add(prefix);
    let continuationToken: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      for (const object of res.Contents ?? []) {
        if (object.Key) keys.add(object.Key);
      }

      continuationToken = res.IsTruncated
        ? res.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  return Array.from(keys);
}

export async function removeSelection(
  bucket: string,
  entries: RemoveSelectionEntry[]
): Promise<RemoveSelectionResult> {
  if (!bucket) {
    return { ok: false, needsAuth: false, error: 'Missing bucket name' };
  }
  if (entries.length === 0) {
    return { ok: false, needsAuth: false, error: 'No objects selected' };
  }

  try {
    const client = await getS3Client();
    const keys = await collectSelectionKeys(client, bucket, entries);
    const errors: { key: string; error: string }[] = [];
    let deleted = 0;

    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);
      if (chunk.length === 0) continue;

      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      );

      deleted += res.Deleted?.length ?? 0;
      for (const error of res.Errors ?? []) {
        errors.push({
          key: error.Key ?? '',
          error: error.Message ?? error.Code ?? 'Delete failed',
        });
      }
    }

    return { ok: true, deleted, errors };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    const detail = describeAwsError(e);
    console.error('[s3/removeSelection] FAILED:', detail, e);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export type BucketPolicyResult =
  | { ok: true; bucket: string; policy: string | null }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; accessDenied?: boolean; error: string };

export async function getBucketPolicy(
  bucket: string
): Promise<BucketPolicyResult> {
  if (!bucket) {
    return { ok: false, needsAuth: false, error: 'Missing bucket name' };
  }

  try {
    const client = await getS3Client();
    const res = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    const policy = res.Policy ?? null;
    return {
      ok: true,
      bucket,
      policy: policy ? JSON.stringify(JSON.parse(policy), null, 2) : null,
    };
  } catch (e) {
    if (e instanceof S3AuthRequiredError) return { ok: false, needsAuth: true };
    if (isNoSuchBucketPolicy(e)) return { ok: true, bucket, policy: null };
    const detail = describeAwsError(e);
    console.error('[s3/getBucketPolicy] FAILED:', detail, e);
    return {
      ok: false,
      needsAuth: false,
      accessDenied: isAccessDenied(e),
      error: detail,
    };
  }
}
