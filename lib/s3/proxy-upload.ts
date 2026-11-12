"use client";

import {
  S3_PROXY_MULTIPART_CONCURRENCY,
  s3MultipartPartSize,
  shouldUseS3MultipartUpload,
} from "@/lib/s3/multipart-policy";
import {
  isUploadAbortError,
  runS3UploadBatch,
  throwIfUploadAborted,
  uploadAbortError,
  type S3UploadBatchResult,
  type S3UploadFile,
  type S3UploadProgress,
} from "@/lib/s3/upload-batch";
import { assertS3WebUploadLimits } from "@/lib/s3/web-upload-limits";

type JsonRecord = Record<string, unknown>;
const CONFLICT_CHECK_BATCH_SIZE = 1000;

export class ProxyS3AuthRequiredError extends Error {
  constructor() {
    super("Object Storage credentials need to be renewed");
    this.name = "ProxyS3AuthRequiredError";
  }
}

class ProxyUploadRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProxyUploadRequestError";
  }
}

function multipartPath(bucket: string) {
  return `/object-storage/buckets/${encodeURIComponent(bucket)}/multipart`;
}

function multipartPartPath(bucket: string) {
  return `${multipartPath(bucket)}/part`;
}

function uploadPath(bucket: string) {
  return `/object-storage/buckets/${encodeURIComponent(bucket)}/upload`;
}

function responseError(body: JsonRecord, status: number) {
  if (body.needsAuth === true) return new ProxyS3AuthRequiredError();
  return new ProxyUploadRequestError(
    typeof body.error === "string"
      ? body.error
      : `Upload request failed with HTTP ${status}`,
    status,
  );
}

async function jsonResponse(response: Response) {
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || body.ok === false)
    throw responseError(body, response.status);
  return body;
}

async function multipartRequest(
  projectId: string,
  bucket: string,
  body: JsonRecord,
  signal?: AbortSignal,
) {
  return jsonResponse(
    await fetch(multipartPath(bucket), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sunrise-Project-Id": projectId,
      },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

export async function findProxyUploadConflicts(
  projectId: string,
  bucket: string,
  keys: string[],
  signal?: AbortSignal,
) {
  const conflicts = new Set<string>();
  const seenKeys = new Set<string>();
  const uniqueKeys: string[] = [];
  for (const key of keys) {
    if (seenKeys.has(key)) {
      conflicts.add(key);
    } else {
      seenKeys.add(key);
      uniqueKeys.push(key);
    }
  }

  for (
    let offset = 0;
    offset < uniqueKeys.length;
    offset += CONFLICT_CHECK_BATCH_SIZE
  ) {
    const body = await multipartRequest(
      projectId,
      bucket,
      {
        action: "check",
        keys: uniqueKeys.slice(offset, offset + CONFLICT_CHECK_BATCH_SIZE),
      },
      signal,
    );
    if (!Array.isArray(body.existingKeys)) continue;
    for (const key of body.existingKeys) {
      if (typeof key === "string") conflicts.add(key);
    }
  }

  return Array.from(conflicts);
}

function uploadSingleObject(
  projectId: string,
  bucket: string,
  item: S3UploadFile,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append("files", item.file, item.file.name);
    formData.append("keys", item.key);
    formData.append("confirmOverwrite", "true");

    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("POST", uploadPath(bucket));
    request.setRequestHeader("X-Sunrise-Project-Id", projectId);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(item.file.size, event.loaded));
      }
    };
    request.onload = () => {
      cleanup();
      let body: JsonRecord = {};
      try {
        body = JSON.parse(request.responseText) as JsonRecord;
      } catch {
        reject(
          new ProxyUploadRequestError(
            request.responseText || `Upload failed with HTTP ${request.status}`,
            request.status,
          ),
        );
        return;
      }
      if (request.status < 200 || request.status >= 300 || body.ok === false) {
        reject(responseError(body, request.status));
        return;
      }
      const errors = Array.isArray(body.errors) ? body.errors : [];
      if (errors.length > 0) {
        const first = errors[0] as { error?: unknown };
        reject(
          new ProxyUploadRequestError(
            typeof first.error === "string" ? first.error : "Upload failed",
          ),
        );
        return;
      }
      onProgress(item.file.size);
      resolve();
    };
    request.onerror = () => {
      cleanup();
      reject(new ProxyUploadRequestError("Upload request failed"));
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
    request.send(formData);
  });
}

function uploadPartRequest(
  projectId: string,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Blob,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) {
  return new Promise<string>((resolve, reject) => {
    const search = new URLSearchParams({
      key,
      uploadId,
      partNumber: String(partNumber),
    });
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("PUT", `${multipartPartPath(bucket)}?${search}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-Sunrise-Project-Id", projectId);
    request.setRequestHeader("X-Sunrise-Part-Size", String(body.size));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(body.size, event.loaded));
    };
    request.onload = () => {
      cleanup();
      let response: JsonRecord = {};
      try {
        response = JSON.parse(request.responseText) as JsonRecord;
      } catch {
        reject(
          new ProxyUploadRequestError(
            request.responseText ||
              `Upload part failed with HTTP ${request.status}`,
            request.status,
          ),
        );
        return;
      }
      if (
        request.status < 200 ||
        request.status >= 300 ||
        response.ok === false
      ) {
        reject(responseError(response, request.status));
        return;
      }
      if (typeof response.etag !== "string") {
        reject(
          new ProxyUploadRequestError("RGW did not return an upload part ETag"),
        );
        return;
      }
      onProgress(body.size);
      resolve(response.etag);
    };
    request.onerror = () => {
      cleanup();
      reject(new ProxyUploadRequestError("Upload part request failed"));
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

function retryable(error: unknown) {
  if (!(error instanceof ProxyUploadRequestError)) return false;
  return (
    error.status === undefined ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
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

async function uploadPartWithRetry(
  projectId: string,
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
      return await uploadPartRequest(
        projectId,
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
      if (attempt === 2 || isUploadAbortError(error) || !retryable(error)) {
        throw error;
      }
      await waitForRetry(500 * 2 ** attempt, signal);
    }
  }
  throw new ProxyUploadRequestError("Upload part failed");
}

async function abortMultipart(
  projectId: string,
  bucket: string,
  key: string,
  uploadId: string,
) {
  await jsonResponse(
    await fetch(multipartPath(bucket), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Sunrise-Project-Id": projectId,
      },
      body: JSON.stringify({ key, uploadId }),
    }),
  );
}

async function uploadMultipartObject(
  projectId: string,
  bucket: string,
  item: S3UploadFile,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) {
  throwIfUploadAborted(signal);
  const initiated = await multipartRequest(
    projectId,
    bucket,
    {
      action: "initiate",
      key: item.key,
      contentType: item.file.type || undefined,
    },
    signal,
  );
  if (typeof initiated.uploadId !== "string") {
    throw new ProxyUploadRequestError(
      "RGW did not return a multipart upload ID",
    );
  }
  const uploadId = initiated.uploadId;
  const partSize = s3MultipartPartSize(item.file.size, "proxy");
  const partCount = Math.ceil(item.file.size / partSize);
  const etags = new Array<string>(partCount);
  const loadedByPart = new Array<number>(partCount).fill(0);
  let nextPart = 0;
  const partsController = new AbortController();
  const abortParts = () => partsController.abort();
  signal.addEventListener("abort", abortParts, { once: true });
  if (signal.aborted) partsController.abort();

  const updateProgress = (index: number, loadedBytes: number) => {
    loadedByPart[index] = loadedBytes;
    onProgress(loadedByPart.reduce((total, loaded) => total + loaded, 0));
  };

  const worker = async () => {
    while (true) {
      throwIfUploadAborted(partsController.signal);
      const partIndex = nextPart;
      nextPart += 1;
      if (partIndex >= partCount) return;
      const start = partIndex * partSize;
      const body = item.file.slice(
        start,
        Math.min(item.file.size, start + partSize),
      );
      etags[partIndex] = await uploadPartWithRetry(
        projectId,
        bucket,
        item.key,
        uploadId,
        partIndex + 1,
        body,
        (loadedBytes) => updateProgress(partIndex, loadedBytes),
        partsController.signal,
      );
    }
  };
  const workers = Array.from(
    { length: Math.min(S3_PROXY_MULTIPART_CONCURRENCY, partCount) },
    () => worker(),
  );

  try {
    await Promise.all(workers);
    throwIfUploadAborted(signal);
    await multipartRequest(
      projectId,
      bucket,
      {
        action: "complete",
        key: item.key,
        uploadId,
        parts: etags.map((etag, index) => ({
          partNumber: index + 1,
          etag,
        })),
      },
      signal,
    );
    onProgress(item.file.size);
  } catch (error) {
    partsController.abort();
    await Promise.allSettled(workers);
    await abortMultipart(projectId, bucket, item.key, uploadId).catch(
      () => undefined,
    );
    if (signal.aborted) throw uploadAbortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortParts);
  }
}

export function describeProxyUploadError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function uploadProxyFiles(
  projectId: string,
  bucket: string,
  files: S3UploadFile[],
  onProgress: (progress: S3UploadProgress) => void,
  signal: AbortSignal,
): Promise<S3UploadBatchResult> {
  assertS3WebUploadLimits(files);
  return runS3UploadBatch(
    files,
    (item, report, uploadSignal) =>
      shouldUseS3MultipartUpload(item.file.size, "proxy")
        ? uploadMultipartObject(projectId, bucket, item, report, uploadSignal)
        : uploadSingleObject(projectId, bucket, item, report, uploadSignal),
    describeProxyUploadError,
    onProgress,
    signal,
    (error) => error instanceof ProxyS3AuthRequiredError,
  );
}
