import {
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type BrowserObjectRow =
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

export interface BrowserSizeResult {
  totalBytes: number;
  objectCount: number;
  folderCount: number;
  scannedPrefixes: string[];
}

export interface BrowserRemoveResult {
  deleted: number;
  errors: { key: string; error: string }[];
}

export interface BrowserBucketPolicyResult {
  bucketArn: string;
  policy: string | null;
}

function basenameOf(prefix: string, key: string) {
  const tail = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return tail.replace(/\/$/, '');
}

function listedFolderPrefix(prefix: string) {
  const normalized = prefix.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  return normalized && !normalized.endsWith('/')
    ? `${normalized}/`
    : normalized;
}

function normalizeObjectKey(key: string) {
  return key.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function awsErrorName(error: unknown) {
  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return {
    name: candidate?.name ?? candidate?.Code ?? candidate?.code,
    status: candidate?.$metadata?.httpStatusCode,
  };
}

export function describeBrowserS3Error(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const { name, status } = awsErrorName(error);
  return `${name ?? 'Error'}${status ? ` (${status})` : ''}: ${
    error.message || String(error)
  }`;
}

export function isBrowserAccessDenied(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === 'AccessDenied' || name === 'Forbidden' || status === 403;
}

function isNoSuchObject(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}

function isNoSuchBucketPolicy(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === 'NoSuchBucketPolicy' || status === 404;
}

function uniqueFolderPrefixes(rows: BrowserObjectRow[]) {
  return Array.from(
    new Set(
      rows
        .filter(
          (row): row is Extract<BrowserObjectRow, { kind: 'folder' }> =>
            row.kind === 'folder'
        )
        .map((row) => listedFolderPrefix(row.fullPath))
        .filter(Boolean)
    )
  )
    .sort((a, b) => a.length - b.length)
    .filter((prefix, index, prefixes) =>
      prefixes.slice(0, index).every((parent) => !prefix.startsWith(parent))
    );
}

async function listAllKeys(client: S3Client, bucket: string, prefix: string) {
  const keys: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push({ key: object.Key, size: object.Size ?? 0 });
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

export async function listBrowserObjects(
  client: S3Client,
  bucket: string,
  prefix: string
) {
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      Delimiter: '/',
      MaxKeys: 1000,
    })
  );

  const rows: BrowserObjectRow[] = [
    ...(response.CommonPrefixes ?? [])
      .filter((item) => !!item.Prefix)
      .map((item) => ({
        kind: 'folder' as const,
        name: basenameOf(prefix, item.Prefix!),
        fullPath: item.Prefix!,
      })),
    ...(response.Contents ?? [])
      .filter((item) => !!item.Key && item.Key !== prefix)
      .map((item) => ({
        kind: 'object' as const,
        name: basenameOf(prefix, item.Key!),
        fullPath: item.Key!,
        size: typeof item.Size === 'number' ? item.Size : null,
        lastModified: item.LastModified
          ? item.LastModified.toISOString()
          : null,
        storageClass: item.StorageClass ?? null,
        etag: item.ETag ?? null,
      })),
  ];

  return { rows, isTruncated: !!response.IsTruncated };
}

export async function findBrowserUploadConflicts(
  client: S3Client,
  bucket: string,
  keys: string[]
) {
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  const conflicts = new Set(duplicates);

  for (const key of Array.from(new Set(keys))) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      conflicts.add(key);
    } catch (error) {
      if (!isNoSuchObject(error)) throw error;
    }
  }

  return Array.from(conflicts);
}

export function browserUploadKey(prefix: string, relativePath: string) {
  return normalizeObjectKey(`${listedFolderPrefix(prefix)}${relativePath}`);
}

function directUploadPercentage(
  processedBytes: number,
  currentBytes: number,
  totalBytes: number,
  processedFiles: number,
  totalFiles: number
) {
  if (totalBytes > 0) {
    return Math.round(
      (Math.min(totalBytes, processedBytes + currentBytes) / totalBytes) * 100
    );
  }
  return Math.round((processedFiles / totalFiles) * 100);
}

async function uploadBrowserFile(
  client: S3Client,
  bucket: string,
  file: File,
  key: string,
  onProgress: (uploadedBytes: number) => void
) {
  const contentType = file.type || undefined;
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 15 * 60 }
  );

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    if (contentType) request.setRequestHeader('Content-Type', contentType);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(file.size, event.loaded));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }

      const detail = request.responseText
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      reject(
        new Error(
          `Direct upload failed with HTTP ${request.status}${
            detail ? `: ${detail}` : ''
          }`
        )
      );
    };
    request.onerror = () => {
      reject(
        new Error(
          'Direct upload request failed. Check the bucket CORS policy and network connection.'
        )
      );
    };
    request.onabort = () => reject(new Error('Direct upload was cancelled'));
    request.send(file);
  });
}

export async function uploadBrowserFiles(
  client: S3Client,
  bucket: string,
  files: { file: File; key: string }[],
  onProgress: (percentage: number) => void
) {
  const errors: { key: string; error: string }[] = [];
  let uploaded = 0;
  let processedBytes = 0;
  const totalBytes = files.reduce((total, { file }) => total + file.size, 0);

  for (let index = 0; index < files.length; index += 1) {
    const { file, key } = files[index];
    try {
      await uploadBrowserFile(client, bucket, file, key, (uploadedBytes) => {
        const percentage = directUploadPercentage(
          processedBytes,
          uploadedBytes,
          totalBytes,
          index,
          files.length
        );
        // The final 100% is reserved for the successful RGW response.
        onProgress(
          index === files.length - 1 ? Math.min(99, percentage) : percentage
        );
      });
      uploaded += 1;
    } catch (error) {
      errors.push({ key, error: describeBrowserS3Error(error) });
    } finally {
      processedBytes += file.size;
      onProgress(
        directUploadPercentage(
          processedBytes,
          0,
          totalBytes,
          index + 1,
          files.length
        )
      );
    }
  }

  return { uploaded, errors };
}

export async function createBrowserFolder(
  client: S3Client,
  bucket: string,
  prefix: string,
  folderName: string
) {
  const name = folderName.trim().replace(/^\/+|\/+$/g, '');
  if (!name) throw new Error('Missing folder name');

  const key = `${listedFolderPrefix(prefix)}${normalizeObjectKey(name)}/`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(0),
    })
  );
  return key;
}

export async function calculateBrowserSelectionSize(
  client: S3Client,
  bucket: string,
  rows: BrowserObjectRow[]
): Promise<BrowserSizeResult> {
  const folderPrefixes = uniqueFolderPrefixes(rows);
  const countedKeys = new Set<string>();
  let totalBytes = 0;
  let objectCount = 0;

  for (const prefix of folderPrefixes) {
    for (const object of await listAllKeys(client, bucket, prefix)) {
      if (countedKeys.has(object.key)) continue;
      countedKeys.add(object.key);
      totalBytes += object.size;
      objectCount += 1;
    }
  }

  for (const row of rows) {
    if (row.kind !== 'object' || countedKeys.has(row.fullPath)) continue;
    if (folderPrefixes.some((prefix) => row.fullPath.startsWith(prefix)))
      continue;

    countedKeys.add(row.fullPath);
    if (row.size !== null) {
      totalBytes += row.size;
    } else {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: row.fullPath })
      );
      totalBytes += head.ContentLength ?? 0;
    }
    objectCount += 1;
  }

  return {
    totalBytes,
    objectCount,
    folderCount: folderPrefixes.length,
    scannedPrefixes: folderPrefixes,
  };
}

export async function collectBrowserSelectionKeys(
  client: S3Client,
  bucket: string,
  rows: BrowserObjectRow[]
) {
  const folderPrefixes = uniqueFolderPrefixes(rows);
  const keys = new Set<string>();

  for (const row of rows) {
    if (row.kind !== 'object') continue;
    if (folderPrefixes.some((prefix) => row.fullPath.startsWith(prefix)))
      continue;
    keys.add(row.fullPath);
  }

  for (const prefix of folderPrefixes) {
    keys.add(prefix);
    for (const object of await listAllKeys(client, bucket, prefix)) {
      keys.add(object.key);
    }
  }

  return Array.from(keys);
}

export async function removeBrowserSelection(
  client: S3Client,
  bucket: string,
  rows: BrowserObjectRow[]
): Promise<BrowserRemoveResult> {
  const keys = await collectBrowserSelectionKeys(client, bucket, rows);
  const errors: { key: string; error: string }[] = [];
  let deleted = 0;

  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000);
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );
    deleted += response.Deleted?.length ?? 0;
    for (const error of response.Errors ?? []) {
      errors.push({
        key: error.Key ?? '',
        error: error.Message ?? error.Code ?? 'Delete failed',
      });
    }
  }

  return { deleted, errors };
}

export async function getBrowserBucketPolicy(
  client: S3Client,
  bucket: string
): Promise<BrowserBucketPolicyResult> {
  try {
    const response = await client.send(
      new GetBucketPolicyCommand({ Bucket: bucket })
    );
    const policy = response.Policy ?? null;
    return {
      bucketArn: `arn:aws:s3:::${bucket}`,
      policy: policy ? JSON.stringify(JSON.parse(policy), null, 2) : null,
    };
  } catch (error) {
    if (isNoSuchBucketPolicy(error)) {
      return { bucketArn: `arn:aws:s3:::${bucket}`, policy: null };
    }
    throw error;
  }
}

export async function getBrowserDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string
) {
  const fileName = key.split('/').filter(Boolean).pop() ?? key;
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`,
    }),
    { expiresIn: 300 }
  );
}
