"use client";

import {
  createS3MultipartCheckpoint,
  deleteS3MultipartCheckpoint,
  fingerprintS3UploadFile,
  getS3MultipartCheckpoint,
  isS3MultipartCheckpointExpired,
  matchesS3MultipartCheckpointFile,
  saveS3MultipartCheckpoint,
  type S3MultipartCheckpoint,
  type S3MultipartCheckpointPart,
  type S3MultipartCheckpointScope,
} from "@/lib/s3/multipart-checkpoints";
import {
  throwIfUploadAborted,
  uploadAbortError,
  type S3UploadFile,
} from "@/lib/s3/upload-batch";

const PAUSE_REASON = "sunrise:s3-upload-paused";

export interface S3MultipartTransport {
  initiate: (item: S3UploadFile) => Promise<string>;
  listParts: (
    key: string,
    uploadId: string,
    signal: AbortSignal,
  ) => Promise<S3MultipartCheckpointPart[]>;
  uploadPart: (
    key: string,
    uploadId: string,
    partNumber: number,
    body: Blob,
    onProgress: (loadedBytes: number) => void,
    signal: AbortSignal,
  ) => Promise<string>;
  complete: (
    key: string,
    uploadId: string,
    parts: S3MultipartCheckpointPart[],
  ) => Promise<void>;
  abort: (key: string, uploadId: string) => Promise<void>;
  isMissingUpload: (error: unknown) => boolean;
}

interface ResumableMultipartInput {
  scope: S3MultipartCheckpointScope;
  item: S3UploadFile;
  partSize: number;
  concurrency: number;
  transport: S3MultipartTransport;
  onProgress: (loadedBytes: number) => void;
  signal: AbortSignal;
}

export class S3MultipartFileMismatchError extends Error {
  constructor(readonly checkpoint: S3MultipartCheckpoint) {
    super(
      `Select the original ${checkpoint.fileName} file to resume this upload, or discard the interrupted upload first.`,
    );
    this.name = "S3MultipartFileMismatchError";
  }
}

export function pauseS3Upload(controller: AbortController) {
  controller.abort(PAUSE_REASON);
}

export function isS3UploadPause(signal: AbortSignal) {
  return signal.aborted && signal.reason === PAUSE_REASON;
}

export async function assertNoPendingS3MultipartUpload(
  scope: S3MultipartCheckpointScope,
  item: S3UploadFile,
) {
  const checkpoint = await getS3MultipartCheckpoint(scope, item.key);
  if (checkpoint) throw new S3MultipartFileMismatchError(checkpoint);
}

function expectedPartSize(fileSize: number, partSize: number, index: number) {
  return Math.min(partSize, fileSize - index * partSize);
}

function reusableParts(
  parts: S3MultipartCheckpointPart[],
  fileSize: number,
  partSize: number,
) {
  const partCount = Math.ceil(fileSize / partSize);
  return parts
    .filter((part) => {
      const index = part.partNumber - 1;
      return (
        part.partNumber >= 1 &&
        part.partNumber <= partCount &&
        part.etag.length > 0 &&
        part.size === expectedPartSize(fileSize, partSize, index)
      );
    })
    .sort((left, right) => left.partNumber - right.partNumber);
}

async function discardRemoteCheckpoint(
  transport: S3MultipartTransport,
  checkpoint: S3MultipartCheckpoint,
) {
  try {
    await transport.abort(checkpoint.key, checkpoint.uploadId);
  } catch (error) {
    if (!transport.isMissingUpload(error)) throw error;
  }
  await deleteS3MultipartCheckpoint(checkpoint.id);
}

async function cleanupExplicitCancellation(
  input: ResumableMultipartInput,
  knownCheckpoint?: S3MultipartCheckpoint,
) {
  if (!input.signal.aborted || isS3UploadPause(input.signal)) return false;
  const checkpoint =
    knownCheckpoint ??
    (await getS3MultipartCheckpoint(input.scope, input.item.key));
  if (!checkpoint) return true;
  try {
    await discardRemoteCheckpoint(input.transport, checkpoint);
  } catch {
    // Keep the checkpoint so the user can retry cleanup explicitly.
  }
  return true;
}

export async function discardS3MultipartCheckpoint(
  transport: S3MultipartTransport,
  checkpoint: S3MultipartCheckpoint,
) {
  await discardRemoteCheckpoint(transport, checkpoint);
}

async function initiateCheckpoint(
  input: ResumableMultipartInput,
  fingerprint: string,
) {
  throwIfUploadAborted(input.signal);
  // Wait for the upload ID so cancellation can address the remote upload.
  const uploadId = await input.transport.initiate(input.item);
  const checkpoint = createS3MultipartCheckpoint({
    scope: input.scope,
    key: input.item.key,
    uploadId,
    partSize: input.partSize,
    file: input.item.file,
    fileFingerprint: fingerprint,
  });
  const persisted = await saveS3MultipartCheckpoint(checkpoint);
  return { checkpoint, persisted };
}

async function loadCheckpoint(
  input: ResumableMultipartInput,
  fingerprint: string,
) {
  let checkpoint = await getS3MultipartCheckpoint(input.scope, input.item.key);
  throwIfUploadAborted(input.signal);
  if (checkpoint && isS3MultipartCheckpointExpired(checkpoint)) {
    await discardRemoteCheckpoint(input.transport, checkpoint);
    checkpoint = null;
    throwIfUploadAborted(input.signal);
  }
  if (
    checkpoint &&
    !matchesS3MultipartCheckpointFile(checkpoint, input.item.file, fingerprint)
  ) {
    throw new S3MultipartFileMismatchError(checkpoint);
  }

  if (!checkpoint) return initiateCheckpoint(input, fingerprint);

  try {
    checkpoint.completedParts = reusableParts(
      await input.transport.listParts(
        checkpoint.key,
        checkpoint.uploadId,
        input.signal,
      ),
      checkpoint.fileSize,
      checkpoint.partSize,
    );
    await saveS3MultipartCheckpoint(checkpoint);
    return { checkpoint, persisted: true };
  } catch (error) {
    if (input.signal.aborted) throw error;
    if (!input.transport.isMissingUpload(error)) throw error;
    await deleteS3MultipartCheckpoint(checkpoint.id);
    throwIfUploadAborted(input.signal);
    return initiateCheckpoint(input, fingerprint);
  }
}

export async function uploadResumableS3Multipart(
  input: ResumableMultipartInput,
) {
  let loaded: Awaited<ReturnType<typeof loadCheckpoint>> | undefined;
  try {
    throwIfUploadAborted(input.signal);
    const fingerprint = await fingerprintS3UploadFile(input.item.file);
    throwIfUploadAborted(input.signal);
    loaded = await loadCheckpoint(input, fingerprint);
  } catch (error) {
    if (await cleanupExplicitCancellation(input, loaded?.checkpoint)) {
      throw uploadAbortError();
    }
    throw error;
  }
  const checkpoint = loaded.checkpoint;
  let persisted = loaded.persisted;
  const partCount = Math.ceil(input.item.file.size / checkpoint.partSize);
  const completed = new Map(
    checkpoint.completedParts.map((part) => [part.partNumber, part]),
  );
  const loadedByPart = Array.from(
    { length: partCount },
    (_, index) => completed.get(index + 1)?.size ?? 0,
  );
  const report = () =>
    input.onProgress(
      loadedByPart.reduce((total, loadedBytes) => total + loadedBytes, 0),
    );
  report();

  const missingPartIndexes = Array.from(
    { length: partCount },
    (_, index) => index,
  ).filter((index) => !completed.has(index + 1));
  let nextMissingPart = 0;
  let checkpointWrite = Promise.resolve();
  const partsController = new AbortController();
  const abortParts = () => partsController.abort(input.signal.reason);
  input.signal.addEventListener("abort", abortParts, { once: true });
  if (input.signal.aborted) partsController.abort(input.signal.reason);

  const saveCompletedParts = () => {
    checkpoint.completedParts = Array.from(completed.values()).sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    checkpointWrite = checkpointWrite.then(async () => {
      persisted = (await saveS3MultipartCheckpoint(checkpoint)) || persisted;
    });
    return checkpointWrite;
  };

  const worker = async () => {
    while (true) {
      throwIfUploadAborted(partsController.signal);
      const missingIndex = nextMissingPart;
      nextMissingPart += 1;
      if (missingIndex >= missingPartIndexes.length) return;
      const partIndex = missingPartIndexes[missingIndex];
      const start = partIndex * checkpoint.partSize;
      const body = input.item.file.slice(
        start,
        Math.min(input.item.file.size, start + checkpoint.partSize),
      );
      const partNumber = partIndex + 1;
      const etag = await input.transport.uploadPart(
        input.item.key,
        checkpoint.uploadId,
        partNumber,
        body,
        (loadedBytes) => {
          loadedByPart[partIndex] = Math.min(body.size, loadedBytes);
          report();
        },
        partsController.signal,
      );
      loadedByPart[partIndex] = body.size;
      completed.set(partNumber, { partNumber, etag, size: body.size });
      report();
      await saveCompletedParts();
    }
  };
  const workers = Array.from(
    { length: Math.min(input.concurrency, missingPartIndexes.length) },
    () => worker(),
  );

  try {
    await Promise.all(workers);
    await checkpointWrite;
    throwIfUploadAborted(input.signal);
    const parts = Array.from(completed.values()).sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    // Completion is a commit boundary; aborting its response leaves the result unknown.
    await input.transport.complete(input.item.key, checkpoint.uploadId, parts);
    await deleteS3MultipartCheckpoint(checkpoint.id);
    input.onProgress(input.item.file.size);
  } catch (error) {
    partsController.abort(input.signal.reason);
    await Promise.allSettled(workers);
    await checkpointWrite.catch(() => undefined);
    if (await cleanupExplicitCancellation(input, checkpoint)) {
      throw uploadAbortError();
    }
    if (!persisted) {
      await input.transport
        .abort(checkpoint.key, checkpoint.uploadId)
        .catch(() => undefined);
    }
    throw error;
  } finally {
    input.signal.removeEventListener("abort", abortParts);
  }
}
