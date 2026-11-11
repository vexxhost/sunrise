import { describe, expect, it } from "vitest";
import {
  S3_MULTIPART_DEFAULT_PART_SIZE_BYTES,
  S3_MULTIPART_MAX_PARTS,
  S3_MULTIPART_THRESHOLD_BYTES,
  S3_MAX_OBJECT_SIZE_BYTES,
  S3_PROXY_MULTIPART_PART_SIZE_BYTES,
  S3_PROXY_MULTIPART_THRESHOLD_BYTES,
  s3MultipartPartSize,
  shouldUseS3MultipartUpload,
} from "@/lib/s3/multipart-policy";

describe("S3 multipart upload policy", () => {
  it("keeps small objects on a single PUT", () => {
    expect(shouldUseS3MultipartUpload(S3_MULTIPART_THRESHOLD_BYTES - 1)).toBe(
      false,
    );
    expect(shouldUseS3MultipartUpload(S3_MULTIPART_THRESHOLD_BYTES)).toBe(true);
    expect(
      shouldUseS3MultipartUpload(
        S3_PROXY_MULTIPART_THRESHOLD_BYTES - 1,
        "proxy",
      ),
    ).toBe(false);
    expect(
      shouldUseS3MultipartUpload(S3_PROXY_MULTIPART_THRESHOLD_BYTES, "proxy"),
    ).toBe(true);
  });

  it("uses the default part size for ordinary large objects", () => {
    expect(s3MultipartPartSize(1024 * 1024 * 1024)).toBe(
      S3_MULTIPART_DEFAULT_PART_SIZE_BYTES,
    );
    expect(s3MultipartPartSize(24 * 1024 * 1024, "proxy")).toBe(
      S3_PROXY_MULTIPART_PART_SIZE_BYTES,
    );
  });

  it("increases and rounds part size before exceeding 10,000 parts", () => {
    const objectSize = S3_MULTIPART_DEFAULT_PART_SIZE_BYTES * 20_000;
    const partSize = s3MultipartPartSize(objectSize);

    expect(Math.ceil(objectSize / partSize)).toBeLessThanOrEqual(
      S3_MULTIPART_MAX_PARTS,
    );
    expect(partSize % (1024 * 1024)).toBe(0);
  });

  it("rejects invalid sizes", () => {
    expect(() => s3MultipartPartSize(Number.NaN)).toThrow(
      "non-negative finite",
    );
    expect(() => s3MultipartPartSize(-1)).toThrow("non-negative finite");
    expect(() => s3MultipartPartSize(S3_MAX_OBJECT_SIZE_BYTES + 1)).toThrow(
      "maximum size of 5 TiB",
    );
  });
});
