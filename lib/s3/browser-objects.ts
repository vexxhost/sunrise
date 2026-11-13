import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  S3MultipartCheckpoint,
  S3MultipartCheckpointPart,
  S3MultipartCheckpointScope,
} from "@/lib/s3/multipart-checkpoints";
import {
  S3_MULTIPART_CONCURRENCY,
  s3MultipartPartSize,
  shouldUseS3MultipartUpload,
} from "@/lib/s3/multipart-policy";
import {
  assertNoPendingS3MultipartUpload,
  discardS3MultipartCheckpoint,
  S3MultipartFileMismatchError,
  uploadResumableS3Multipart,
  type S3MultipartTransport,
} from "@/lib/s3/resumable-multipart";
import {
  runS3UploadBatch,
  throwIfUploadAborted,
  uploadAbortError,
  type S3UploadFile,
  type S3UploadProgress,
} from "@/lib/s3/upload-batch";
import { assertS3WebUploadLimits } from "@/lib/s3/web-upload-limits";

export type BrowserObjectRow =
  | { kind: "folder"; name: string; fullPath: string }
  | {
      kind: "object";
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
  return tail.replace(/\/$/, "");
}

function listedFolderPrefix(prefix: string) {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  return normalized && !normalized.endsWith("/")
    ? `${normalized}/`
    : normalized;
}

function normalizeObjectKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
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
  return `${name ?? "Error"}${status ? ` (${status})` : ""}: ${
    error.message || String(error)
  }`;
}

export function isBrowserAccessDenied(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === "AccessDenied" || name === "Forbidden" || status === 403;
}

export function isBrowserObjectNotFound(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

function isNoSuchBucketPolicy(error: unknown) {
  const { name, status } = awsErrorName(error);
  return name === "NoSuchBucketPolicy" || status === 404;
}

function uniqueFolderPrefixes(rows: BrowserObjectRow[]) {
  return Array.from(
    new Set(
      rows
        .filter(
          (row): row is Extract<BrowserObjectRow, { kind: "folder" }> =>
            row.kind === "folder",
        )
        .map((row) => listedFolderPrefix(row.fullPath))
        .filter(Boolean),
    ),
  )
    .sort((a, b) => a.length - b.length)
    .filter((prefix, index, prefixes) =>
      prefixes.slice(0, index).every((parent) => !prefix.startsWith(parent)),
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
      }),
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
  prefix: string,
) {
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      Delimiter: "/",
      MaxKeys: 1000,
    }),
  );

  const rows: BrowserObjectRow[] = [
    ...(response.CommonPrefixes ?? [])
      .filter((item) => !!item.Prefix)
      .map((item) => ({
        kind: "folder" as const,
        name: basenameOf(prefix, item.Prefix!),
        fullPath: item.Prefix!,
      })),
    ...(response.Contents ?? [])
      .filter((item) => !!item.Key && item.Key !== prefix)
      .map((item) => ({
        kind: "object" as const,
        name: basenameOf(prefix, item.Key!),
        fullPath: item.Key!,
        size: typeof item.Size === "number" ? item.Size : null,
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
  keys: string[],
  signal?: AbortSignal,
) {
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  const conflicts = new Set(duplicates);

  for (const key of Array.from(new Set(keys))) {
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
        signal ? { abortSignal: signal } : undefined,
      );
      conflicts.add(key);
    } catch (error) {
      if (!isBrowserObjectNotFound(error)) throw error;
    }
  }

  return Array.from(conflicts);
}

export function browserUploadKey(prefix: string, relativePath: string) {
  return normalizeObjectKey(`${listedFolderPrefix(prefix)}${relativePath}`);
}

async function uploadBrowserFile(
  client: S3Client,
  bucket: string,
  file: File,
  key: string,
  onProgress: (uploadedBytes: number) => void,
  signal: AbortSignal,
) {
  throwIfUploadAborted(signal);
  const contentType = file.type || undefined;
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 15 * 60 },
  );
  throwIfUploadAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("PUT", url);
    if (contentType) request.setRequestHeader("Content-Type", contentType);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(file.size, event.loaded));
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }

      const detail = request.responseText
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 240);
      reject(
        new Error(
          `Direct upload failed with HTTP ${request.status}${
            detail ? `: ${detail}` : ""
          }`,
        ),
      );
    };
    request.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Direct upload request failed. Check the bucket CORS policy and network connection.",
        ),
      );
    };
    request.onabort = () => {
      cleanup();
      reject(uploadAbortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(uploadAbortError());
      return;
    }
    request.send(file);
  });
}

class DirectMultipartRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DirectMultipartRequestError";
  }
}

function waitForDirectRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timeout = 0;
    const abort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(uploadAbortError());
    };
    if (signal.aborted) {
      abort();
      return;
    }
    timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function uploadBrowserPartRequest(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Blob,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) {
  throwIfUploadAborted(signal);
  const url = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 15 * 60 },
  );
  throwIfUploadAborted(signal);

  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("PUT", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(body.size, event.loaded));
      }
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("ETag");
        if (!etag) {
          reject(
            new DirectMultipartRequestError(
              "RGW did not expose the upload part ETag. Add ETag to the bucket or global CORS expose headers.",
              request.status,
            ),
          );
          return;
        }
        onProgress(body.size);
        resolve(etag);
        return;
      }
      const detail = request.responseText
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 240);
      reject(
        new DirectMultipartRequestError(
          `Direct upload part failed with HTTP ${request.status}${
            detail ? `: ${detail}` : ""
          }`,
          request.status,
        ),
      );
    };
    request.onerror = () => {
      cleanup();
      reject(
        new DirectMultipartRequestError(
          "Direct upload part request failed. Check the bucket CORS policy and network connection.",
        ),
      );
    };
    request.onabort = () => {
      cleanup();
      reject(uploadAbortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(uploadAbortError());
      return;
    }
    request.send(body);
  });
}

async function uploadBrowserPartWithRetry(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Blob,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await uploadBrowserPartRequest(
        client,
        bucket,
        key,
        uploadId,
        partNumber,
        body,
        onProgress,
        signal,
      );
    } catch (error) {
      onProgress(0);
      const retryable =
        error instanceof DirectMultipartRequestError &&
        (error.status === undefined ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500);
      if (attempt === 2 || signal.aborted || !retryable) throw error;
      await waitForDirectRetry(500 * 2 ** attempt, signal);
    }
  }
  throw new DirectMultipartRequestError("Direct upload part failed");
}

function browserMultipartTransport(
  client: S3Client,
  bucket: string,
): S3MultipartTransport {
  return {
    initiate: async (item, signal) => {
      const response = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: item.key,
          ContentType: item.file.type || undefined,
        }),
        { abortSignal: signal },
      );
      if (!response.UploadId) {
        throw new DirectMultipartRequestError(
          "RGW did not return a multipart upload ID",
        );
      }
      return response.UploadId;
    },
    listParts: async (key, uploadId, signal) => {
      const parts: S3MultipartCheckpointPart[] = [];
      let partNumberMarker: string | undefined;
      do {
        const response = await client.send(
          new ListPartsCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: partNumberMarker,
          }),
          { abortSignal: signal },
        );
        for (const part of response.Parts ?? []) {
          if (
            typeof part.PartNumber === "number" &&
            typeof part.ETag === "string" &&
            typeof part.Size === "number"
          ) {
            parts.push({
              partNumber: part.PartNumber,
              etag: part.ETag,
              size: part.Size,
            });
          }
        }
        partNumberMarker = response.IsTruncated
          ? response.NextPartNumberMarker
          : undefined;
      } while (partNumberMarker);
      return parts;
    },
    uploadPart: (key, uploadId, partNumber, body, onProgress, signal) =>
      uploadBrowserPartWithRetry(
        client,
        bucket,
        key,
        uploadId,
        partNumber,
        body,
        onProgress,
        signal,
      ),
    complete: async (key, uploadId, parts, signal) => {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              ETag: part.etag,
              PartNumber: part.partNumber,
            })),
          },
        }),
        { abortSignal: signal },
      );
    },
    abort: async (key, uploadId) => {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    },
    isMissingUpload: (error) => {
      const { name } = awsErrorName(error);
      return name === "NoSuchUpload";
    },
  };
}

export function discardBrowserS3MultipartCheckpoint(
  client: S3Client,
  bucket: string,
  checkpoint: S3MultipartCheckpoint,
) {
  return discardS3MultipartCheckpoint(
    browserMultipartTransport(client, bucket),
    checkpoint,
  );
}

async function uploadBrowserMultipartFile(
  client: S3Client,
  bucket: string,
  checkpointScope: S3MultipartCheckpointScope,
  item: S3UploadFile,
  onProgress: (uploadedBytes: number) => void,
  signal: AbortSignal,
) {
  return uploadResumableS3Multipart({
    scope: checkpointScope,
    item,
    partSize: s3MultipartPartSize(item.file.size),
    concurrency: S3_MULTIPART_CONCURRENCY,
    transport: browserMultipartTransport(client, bucket),
    onProgress,
    signal,
  });
}

function describeBrowserUploadError(error: unknown) {
  if (
    error instanceof S3MultipartFileMismatchError ||
    error instanceof DirectMultipartRequestError
  ) {
    return error.message;
  }
  const detail = describeBrowserS3Error(error);
  if (/failed to fetch|networkerror|load failed|cors/i.test(detail)) {
    return `${detail}. Direct multipart uploads require RGW CORS to allow HEAD, GET, POST, PUT, and DELETE and expose the ETag response header.`;
  }
  return detail;
}

export async function uploadBrowserFiles(
  client: S3Client,
  bucket: string,
  checkpointScope: S3MultipartCheckpointScope,
  files: S3UploadFile[],
  onProgress: (progress: S3UploadProgress) => void,
  signal: AbortSignal,
) {
  assertS3WebUploadLimits(files);
  return runS3UploadBatch(
    files,
    (item, report, uploadSignal) =>
      shouldUseS3MultipartUpload(item.file.size)
        ? uploadBrowserMultipartFile(
            client,
            bucket,
            checkpointScope,
            item,
            report,
            uploadSignal,
          )
        : assertNoPendingS3MultipartUpload(checkpointScope, item).then(() =>
            uploadBrowserFile(
              client,
              bucket,
              item.file,
              item.key,
              report,
              uploadSignal,
            ),
          ),
    describeBrowserUploadError,
    onProgress,
    signal,
  );
}

export async function createBrowserFolder(
  client: S3Client,
  bucket: string,
  prefix: string,
  folderName: string,
) {
  const name = folderName.trim().replace(/^\/+|\/+$/g, "");
  if (!name) throw new Error("Missing folder name");

  const key = `${listedFolderPrefix(prefix)}${normalizeObjectKey(name)}/`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(0),
    }),
  );
  return key;
}

export async function calculateBrowserSelectionSize(
  client: S3Client,
  bucket: string,
  rows: BrowserObjectRow[],
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
    if (row.kind !== "object" || countedKeys.has(row.fullPath)) continue;
    if (folderPrefixes.some((prefix) => row.fullPath.startsWith(prefix)))
      continue;

    countedKeys.add(row.fullPath);
    if (row.size !== null) {
      totalBytes += row.size;
    } else {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: row.fullPath }),
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
  rows: BrowserObjectRow[],
) {
  const folderPrefixes = uniqueFolderPrefixes(rows);
  const keys = new Set<string>();

  for (const row of rows) {
    if (row.kind !== "object") continue;
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
  rows: BrowserObjectRow[],
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
      }),
    );
    deleted += response.Deleted?.length ?? 0;
    for (const error of response.Errors ?? []) {
      errors.push({
        key: error.Key ?? "",
        error: error.Message ?? error.Code ?? "Delete failed",
      });
    }
  }

  return { deleted, errors };
}

export async function getBrowserBucketPolicy(
  client: S3Client,
  bucket: string,
): Promise<BrowserBucketPolicyResult> {
  try {
    const response = await client.send(
      new GetBucketPolicyCommand({ Bucket: bucket }),
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
  key: string,
) {
  const fileName = key.split("/").filter(Boolean).pop() ?? key;
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
    }),
    { expiresIn: 300 },
  );
}
