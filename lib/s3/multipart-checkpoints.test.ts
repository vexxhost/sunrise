import { describe, expect, it } from "vitest";
import {
  createS3MultipartCheckpoint,
  fingerprintS3UploadFile,
  isS3MultipartCheckpointExpired,
  matchesS3MultipartCheckpointFile,
  s3MultipartCheckpointId,
  s3MultipartCheckpointScopeKey,
  type S3MultipartCheckpointScope,
} from "@/lib/s3/multipart-checkpoints";

const scope: S3MultipartCheckpointScope = {
  identityScope: "identity-a",
  projectId: "project-a",
  regionId: "RegionOne",
  mode: "direct",
  bucket: "bucket/a",
};

describe("S3 multipart checkpoint metadata", () => {
  it("separates records by identity, project, region, mode, bucket, and key", () => {
    expect(s3MultipartCheckpointScopeKey(scope)).toBe(
      "identity-a|project-a|RegionOne|direct|bucket%2Fa",
    );
    expect(s3MultipartCheckpointId(scope, "folder/disk.raw")).toBe(
      "identity-a|project-a|RegionOne|direct|bucket%2Fa|folder%2Fdisk.raw",
    );
    expect(
      s3MultipartCheckpointId(
        { ...scope, identityScope: "identity-b" },
        "folder/disk.raw",
      ),
    ).not.toBe(s3MultipartCheckpointId(scope, "folder/disk.raw"));
  });

  it("fingerprints file edges and requires matching file metadata", async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4])], "disk.raw", {
      type: "application/octet-stream",
      lastModified: 123,
    });
    const changed = new File([new Uint8Array([1, 2, 3, 5])], "disk.raw", {
      type: "application/octet-stream",
      lastModified: 123,
    });
    const fingerprint = await fingerprintS3UploadFile(original);
    const checkpoint = createS3MultipartCheckpoint(
      {
        scope,
        key: "disk.raw",
        uploadId: "upload-a",
        partSize: 8 * 1024 * 1024,
        file: original,
        fileFingerprint: fingerprint,
      },
      1_000,
    );

    expect(
      matchesS3MultipartCheckpointFile(checkpoint, original, fingerprint),
    ).toBe(true);
    expect(
      matchesS3MultipartCheckpointFile(
        checkpoint,
        changed,
        await fingerprintS3UploadFile(changed),
      ),
    ).toBe(false);
    expect(isS3MultipartCheckpointExpired(checkpoint, 1_000)).toBe(false);
    expect(
      isS3MultipartCheckpointExpired(checkpoint, checkpoint.expiresAt),
    ).toBe(true);
  });
});
