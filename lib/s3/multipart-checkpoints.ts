"use client";

export type S3MultipartMode = "direct" | "proxy";

export interface S3MultipartCheckpointScope {
  identityScope: string;
  projectId: string;
  regionId: string;
  mode: S3MultipartMode;
  bucket: string;
}

export interface S3MultipartCheckpointPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface S3MultipartCheckpoint {
  version: 1;
  id: string;
  scope: string;
  identityScope: string;
  projectId: string;
  regionId: string;
  mode: S3MultipartMode;
  bucket: string;
  key: string;
  uploadId: string;
  partSize: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileLastModified: number;
  fileFingerprint: string;
  completedParts: S3MultipartCheckpointPart[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface CreateS3MultipartCheckpoint {
  scope: S3MultipartCheckpointScope;
  key: string;
  uploadId: string;
  partSize: number;
  file: File;
  fileFingerprint: string;
  completedParts?: S3MultipartCheckpointPart[];
  createdAt?: number;
}

const DATABASE_NAME = "sunrise-s3-multipart";
const DATABASE_VERSION = 1;
const STORE_NAME = "uploads";
const SCOPE_INDEX = "scope";
const CHECKPOINT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const FINGERPRINT_SAMPLE_BYTES = 64 * 1024;

let databasePromise: Promise<IDBDatabase | null> | null = null;

function isCheckpointPart(value: unknown): value is S3MultipartCheckpointPart {
  if (!value || typeof value !== "object") return false;
  const part = value as Partial<S3MultipartCheckpointPart>;
  return (
    Number.isInteger(part.partNumber) &&
    (part.partNumber ?? 0) > 0 &&
    typeof part.etag === "string" &&
    part.etag.length > 0 &&
    typeof part.size === "number" &&
    Number.isFinite(part.size) &&
    part.size >= 0
  );
}

function isCheckpoint(value: unknown): value is S3MultipartCheckpoint {
  if (!value || typeof value !== "object") return false;
  const checkpoint = value as Partial<S3MultipartCheckpoint>;
  return (
    checkpoint.version === 1 &&
    typeof checkpoint.id === "string" &&
    typeof checkpoint.scope === "string" &&
    typeof checkpoint.identityScope === "string" &&
    typeof checkpoint.projectId === "string" &&
    typeof checkpoint.regionId === "string" &&
    (checkpoint.mode === "direct" || checkpoint.mode === "proxy") &&
    typeof checkpoint.bucket === "string" &&
    typeof checkpoint.key === "string" &&
    typeof checkpoint.uploadId === "string" &&
    typeof checkpoint.partSize === "number" &&
    checkpoint.partSize > 0 &&
    typeof checkpoint.fileName === "string" &&
    typeof checkpoint.fileSize === "number" &&
    checkpoint.fileSize >= 0 &&
    typeof checkpoint.fileType === "string" &&
    typeof checkpoint.fileLastModified === "number" &&
    typeof checkpoint.fileFingerprint === "string" &&
    Array.isArray(checkpoint.completedParts) &&
    checkpoint.completedParts.every(isCheckpointPart) &&
    typeof checkpoint.createdAt === "number" &&
    typeof checkpoint.updatedAt === "number" &&
    typeof checkpoint.expiresAt === "number"
  );
}

function encoded(value: string) {
  return encodeURIComponent(value);
}

export function s3MultipartCheckpointScopeKey(
  scope: S3MultipartCheckpointScope,
) {
  return [
    scope.identityScope,
    scope.projectId,
    scope.regionId,
    scope.mode,
    scope.bucket,
  ]
    .map(encoded)
    .join("|");
}

export function s3MultipartCheckpointId(
  scope: S3MultipartCheckpointScope,
  key: string,
) {
  return `${s3MultipartCheckpointScopeKey(scope)}|${encoded(key)}`;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains(SCOPE_INDEX)) {
        store.createIndex(SCOPE_INDEX, "scope", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function fingerprintS3UploadFile(file: File) {
  const first = new Uint8Array(
    await file.slice(0, FINGERPRINT_SAMPLE_BYTES).arrayBuffer(),
  );
  const lastStart = Math.max(
    first.byteLength,
    file.size - FINGERPRINT_SAMPLE_BYTES,
  );
  const last = new Uint8Array(await file.slice(lastStart).arrayBuffer());
  const sample = new Uint8Array(first.byteLength + last.byteLength);
  sample.set(first);
  sample.set(last, first.byteLength);
  return base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", sample)),
  );
}

export function createS3MultipartCheckpoint(
  input: CreateS3MultipartCheckpoint,
  now = Date.now(),
): S3MultipartCheckpoint {
  const scope = s3MultipartCheckpointScopeKey(input.scope);
  const createdAt = input.createdAt ?? now;
  return {
    version: 1,
    id: s3MultipartCheckpointId(input.scope, input.key),
    scope,
    ...input.scope,
    key: input.key,
    uploadId: input.uploadId,
    partSize: input.partSize,
    fileName: input.file.name,
    fileSize: input.file.size,
    fileType: input.file.type,
    fileLastModified: input.file.lastModified,
    fileFingerprint: input.fileFingerprint,
    completedParts: [...(input.completedParts ?? [])].sort(
      (left, right) => left.partNumber - right.partNumber,
    ),
    createdAt,
    updatedAt: now,
    expiresAt: now + CHECKPOINT_LIFETIME_MS,
  };
}

export function matchesS3MultipartCheckpointFile(
  checkpoint: S3MultipartCheckpoint,
  file: File,
  fingerprint: string,
) {
  return (
    checkpoint.fileName === file.name &&
    checkpoint.fileSize === file.size &&
    checkpoint.fileType === file.type &&
    checkpoint.fileLastModified === file.lastModified &&
    checkpoint.fileFingerprint === fingerprint
  );
}

export function isS3MultipartCheckpointExpired(
  checkpoint: S3MultipartCheckpoint,
  now = Date.now(),
) {
  return checkpoint.expiresAt <= now;
}

export async function getS3MultipartCheckpoint(
  scope: S3MultipartCheckpointScope,
  key: string,
) {
  try {
    const database = await openDatabase();
    if (!database) return null;
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestResult<unknown>(
      transaction
        .objectStore(STORE_NAME)
        .get(s3MultipartCheckpointId(scope, key)),
    );
    return isCheckpoint(result) ? result : null;
  } catch {
    return null;
  }
}

export async function listS3MultipartCheckpoints(
  scope: S3MultipartCheckpointScope,
) {
  try {
    const database = await openDatabase();
    if (!database) return [];
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult<unknown[]>(
      transaction
        .objectStore(STORE_NAME)
        .index(SCOPE_INDEX)
        .getAll(s3MultipartCheckpointScopeKey(scope)),
    );
    return records
      .filter(isCheckpoint)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export async function saveS3MultipartCheckpoint(
  checkpoint: S3MultipartCheckpoint,
) {
  try {
    const database = await openDatabase();
    if (!database) return false;
    const now = Date.now();
    checkpoint.updatedAt = now;
    checkpoint.expiresAt = now + CHECKPOINT_LIFETIME_MS;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      ...checkpoint,
      completedParts: [...checkpoint.completedParts].sort(
        (left, right) => left.partNumber - right.partNumber,
      ),
    });
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  }
}

export async function deleteS3MultipartCheckpoint(id: string) {
  try {
    const database = await openDatabase();
    if (!database) return false;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
    return true;
  } catch {
    return false;
  }
}
