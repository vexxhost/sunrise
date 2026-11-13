import { beforeEach, describe, expect, it, vi } from "vitest";

const checkpointMocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  fingerprint: vi.fn(),
  get: vi.fn(),
  isExpired: vi.fn(),
  matches: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/s3/multipart-checkpoints", () => ({
  createS3MultipartCheckpoint: checkpointMocks.create,
  deleteS3MultipartCheckpoint: checkpointMocks.delete,
  fingerprintS3UploadFile: checkpointMocks.fingerprint,
  getS3MultipartCheckpoint: checkpointMocks.get,
  isS3MultipartCheckpointExpired: checkpointMocks.isExpired,
  matchesS3MultipartCheckpointFile: checkpointMocks.matches,
  saveS3MultipartCheckpoint: checkpointMocks.save,
}));

import {
  assertNoPendingS3MultipartUpload,
  pauseS3Upload,
  S3MultipartFileMismatchError,
  uploadResumableS3Multipart,
  type S3MultipartTransport,
} from "@/lib/s3/resumable-multipart";
import type {
  S3MultipartCheckpoint,
  S3MultipartCheckpointScope,
} from "@/lib/s3/multipart-checkpoints";

const scope: S3MultipartCheckpointScope = {
  identityScope: "identity-a",
  projectId: "project-a",
  regionId: "RegionOne",
  mode: "proxy",
  bucket: "bucket-a",
};

function uploadFile() {
  return new File([new Uint8Array(12)], "disk.raw", {
    type: "application/octet-stream",
    lastModified: 123,
  });
}

function checkpoint(
  overrides: Partial<S3MultipartCheckpoint> = {},
): S3MultipartCheckpoint {
  return {
    version: 1,
    id: "checkpoint-a",
    scope: "scope-a",
    ...scope,
    key: "images/disk.raw",
    uploadId: "upload-a",
    partSize: 4,
    fileName: "disk.raw",
    fileSize: 12,
    fileType: "application/octet-stream",
    fileLastModified: 123,
    fileFingerprint: "fingerprint-a",
    completedParts: [],
    createdAt: 1,
    updatedAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function transport(
  overrides: Partial<S3MultipartTransport> = {},
): S3MultipartTransport {
  return {
    initiate: vi.fn(async () => "upload-new"),
    listParts: vi.fn(async () => []),
    uploadPart: vi.fn(async (_key, _uploadId, partNumber, body, onProgress) => {
      onProgress(body.size);
      return `\"part-${partNumber}\"`;
    }),
    complete: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    isMissingUpload: vi.fn(() => false),
    ...overrides,
  };
}

function uploadInput(
  multipartTransport: S3MultipartTransport,
  signal = new AbortController().signal,
) {
  return {
    scope,
    item: { file: uploadFile(), key: "images/disk.raw" },
    partSize: 4,
    concurrency: 2,
    transport: multipartTransport,
    onProgress: vi.fn(),
    signal,
  };
}

describe("uploadResumableS3Multipart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkpointMocks.fingerprint.mockResolvedValue("fingerprint-a");
    checkpointMocks.get.mockResolvedValue(null);
    checkpointMocks.isExpired.mockReturnValue(false);
    checkpointMocks.matches.mockReturnValue(true);
    checkpointMocks.save.mockResolvedValue(true);
    checkpointMocks.delete.mockResolvedValue(undefined);
    checkpointMocks.create.mockImplementation(
      ({ scope: inputScope, key, uploadId, partSize, file, fileFingerprint }) =>
        checkpoint({
          ...inputScope,
          key,
          uploadId,
          partSize,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileLastModified: file.lastModified,
          fileFingerprint,
        }),
    );
  });

  it("reconciles remote parts and uploads only missing parts", async () => {
    checkpointMocks.get.mockResolvedValue(checkpoint());
    const multipartTransport = transport({
      listParts: vi.fn(async () => [
        { partNumber: 1, etag: '"part-1"', size: 4 },
      ]),
    });
    const input = uploadInput(multipartTransport);

    await uploadResumableS3Multipart(input);

    expect(multipartTransport.initiate).not.toHaveBeenCalled();
    expect(multipartTransport.uploadPart).toHaveBeenCalledTimes(2);
    expect(multipartTransport.uploadPart).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-a",
      2,
      expect.objectContaining({ size: 4 }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(multipartTransport.complete).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-a",
      [
        { partNumber: 1, etag: '"part-1"', size: 4 },
        { partNumber: 2, etag: '"part-2"', size: 4 },
        { partNumber: 3, etag: '"part-3"', size: 4 },
      ],
    );
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
    expect(input.onProgress).toHaveBeenLastCalledWith(12);
  });

  it("requires the original file before resuming an existing upload", async () => {
    const existing = checkpoint();
    checkpointMocks.get.mockResolvedValue(existing);
    checkpointMocks.matches.mockReturnValue(false);
    const multipartTransport = transport();

    await expect(
      uploadResumableS3Multipart(uploadInput(multipartTransport)),
    ).rejects.toBeInstanceOf(S3MultipartFileMismatchError);
    expect(multipartTransport.listParts).not.toHaveBeenCalled();
    expect(multipartTransport.abort).not.toHaveBeenCalled();
  });

  it("blocks a single-part overwrite while the same key has a checkpoint", async () => {
    const existing = checkpoint();
    checkpointMocks.get.mockResolvedValue(existing);

    await expect(
      assertNoPendingS3MultipartUpload(scope, {
        file: uploadFile(),
        key: existing.key,
      }),
    ).rejects.toBeInstanceOf(S3MultipartFileMismatchError);
  });

  it("starts a new upload when the saved upload no longer exists", async () => {
    checkpointMocks.get.mockResolvedValue(checkpoint());
    const missing = new Error("missing upload");
    const multipartTransport = transport({
      listParts: vi.fn(async () => {
        throw missing;
      }),
      isMissingUpload: vi.fn((error) => error === missing),
    });

    await uploadResumableS3Multipart(uploadInput(multipartTransport));

    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
    expect(multipartTransport.initiate).toHaveBeenCalledTimes(1);
    expect(multipartTransport.complete).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-new",
      expect.any(Array),
    );
  });

  it("cleans up an existing upload when cancelled during fingerprinting", async () => {
    const existing = checkpoint();
    checkpointMocks.get.mockResolvedValue(existing);
    const fingerprinting = Promise.withResolvers<string>();
    checkpointMocks.fingerprint.mockReturnValue(fingerprinting.promise);
    const controller = new AbortController();
    const multipartTransport = transport();
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );

    controller.abort();
    fingerprinting.resolve("fingerprint-a");

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-a",
    );
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
    expect(multipartTransport.listParts).not.toHaveBeenCalled();
    expect(multipartTransport.initiate).not.toHaveBeenCalled();
  });

  it("preserves an existing upload when navigation pauses fingerprinting", async () => {
    const existing = checkpoint();
    checkpointMocks.get.mockResolvedValue(existing);
    const fingerprinting = Promise.withResolvers<string>();
    checkpointMocks.fingerprint.mockReturnValue(fingerprinting.promise);
    const controller = new AbortController();
    const multipartTransport = transport();
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );

    pauseS3Upload(controller);
    fingerprinting.resolve("fingerprint-a");

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(multipartTransport.abort).not.toHaveBeenCalled();
    expect(checkpointMocks.delete).not.toHaveBeenCalled();
  });

  it("cleans up an existing upload when cancelled during reconciliation", async () => {
    checkpointMocks.get.mockResolvedValue(checkpoint());
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const multipartTransport = transport({
      listParts: vi.fn(async (_key, _uploadId, signal) => {
        started.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
        });
        return [];
      }),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await started.promise;

    controller.abort();

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-a",
    );
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
    expect(multipartTransport.uploadPart).not.toHaveBeenCalled();
  });

  it("preserves an existing upload when navigation pauses reconciliation", async () => {
    checkpointMocks.get.mockResolvedValue(checkpoint());
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const multipartTransport = transport({
      listParts: vi.fn(async (_key, _uploadId, signal) => {
        started.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("paused")), {
            once: true,
          });
        });
        return [];
      }),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await started.promise;

    pauseS3Upload(controller);

    await expect(uploading).rejects.toThrow("paused");
    expect(multipartTransport.abort).not.toHaveBeenCalled();
    expect(checkpointMocks.delete).not.toHaveBeenCalled();
  });

  it("preserves a persistent upload when navigation pauses it", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const multipartTransport = transport({
      uploadPart: vi.fn(
        async (_key, _uploadId, _partNumber, _body, _onProgress, signal) => {
          started.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("paused")),
              {
                once: true,
              },
            );
          });
          return "unreachable";
        },
      ),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await started.promise;

    pauseS3Upload(controller);

    await expect(uploading).rejects.toThrow("paused");
    expect(multipartTransport.abort).not.toHaveBeenCalled();
    expect(checkpointMocks.delete).not.toHaveBeenCalled();
  });

  it("cleans up an upload cancelled while initiation is in progress", async () => {
    const initiated = Promise.withResolvers<string>();
    const controller = new AbortController();
    const multipartTransport = transport({
      initiate: vi.fn(() => initiated.promise),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await vi.waitFor(() => {
      expect(multipartTransport.initiate).toHaveBeenCalledTimes(1);
    });

    controller.abort();
    initiated.resolve("upload-new");

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(checkpointMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "upload-new" }),
    );
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-new",
    );
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
  });

  it("preserves an upload paused while initiation is in progress", async () => {
    const initiated = Promise.withResolvers<string>();
    const controller = new AbortController();
    const multipartTransport = transport({
      initiate: vi.fn(() => initiated.promise),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await vi.waitFor(() => {
      expect(multipartTransport.initiate).toHaveBeenCalledTimes(1);
    });

    pauseS3Upload(controller);
    initiated.resolve("upload-new");

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(checkpointMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "upload-new" }),
    );
    expect(multipartTransport.abort).not.toHaveBeenCalled();
    expect(checkpointMocks.delete).not.toHaveBeenCalled();
  });

  it("aborts an unpersisted upload paused while initiation is in progress", async () => {
    checkpointMocks.save.mockResolvedValue(false);
    const initiated = Promise.withResolvers<string>();
    const controller = new AbortController();
    const multipartTransport = transport({
      initiate: vi.fn(() => initiated.promise),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await vi.waitFor(() => {
      expect(multipartTransport.initiate).toHaveBeenCalledTimes(1);
    });

    pauseS3Upload(controller);
    initiated.resolve("upload-new");

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-new",
    );
    expect(checkpointMocks.delete).not.toHaveBeenCalled();
  });

  it("finishes completion after cancellation reaches the commit boundary", async () => {
    const completing = Promise.withResolvers<void>();
    const controller = new AbortController();
    const multipartTransport = transport({
      complete: vi.fn(() => completing.promise),
    });
    const input = uploadInput(multipartTransport, controller.signal);
    const uploading = uploadResumableS3Multipart(input);
    await vi.waitFor(() => {
      expect(multipartTransport.complete).toHaveBeenCalledTimes(1);
    });

    controller.abort();
    completing.resolve();

    await expect(uploading).resolves.toBeUndefined();
    expect(multipartTransport.abort).not.toHaveBeenCalled();
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
    expect(input.onProgress).toHaveBeenLastCalledWith(12);
  });

  it("aborts an upload on navigation when its checkpoint could not persist", async () => {
    checkpointMocks.save.mockResolvedValue(false);
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const multipartTransport = transport({
      uploadPart: vi.fn(
        async (_key, _uploadId, _partNumber, _body, _onProgress, signal) => {
          started.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("paused")),
              {
                once: true,
              },
            );
          });
          return "unreachable";
        },
      ),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await started.promise;

    pauseS3Upload(controller);

    await expect(uploading).rejects.toThrow("paused");
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-new",
    );
  });

  it("aborts the remote upload and removes its checkpoint when cancelled", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const multipartTransport = transport({
      uploadPart: vi.fn(
        async (_key, _uploadId, _partNumber, _body, _onProgress, signal) => {
          started.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          });
          return "unreachable";
        },
      ),
    });
    const uploading = uploadResumableS3Multipart(
      uploadInput(multipartTransport, controller.signal),
    );
    await started.promise;

    controller.abort();

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(multipartTransport.abort).toHaveBeenCalledWith(
      "images/disk.raw",
      "upload-new",
    );
    expect(checkpointMocks.delete).toHaveBeenCalledWith("checkpoint-a");
  });
});
