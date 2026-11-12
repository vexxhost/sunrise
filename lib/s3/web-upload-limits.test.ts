import { describe, expect, it } from "vitest";
import {
  S3_WEB_UPLOAD_MAX_FILES,
  S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES,
  assertS3WebUploadLimits,
  s3WebUploadLimitError,
} from "@/lib/s3/web-upload-limits";

function candidate(name: string, size = 1) {
  return { name, size };
}

describe("S3 web upload limits", () => {
  it("accepts files and queues at their limits", () => {
    const files = Array.from({ length: S3_WEB_UPLOAD_MAX_FILES }, (_, index) =>
      candidate(`file-${index}`, S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES),
    );

    expect(s3WebUploadLimitError(files)).toBeNull();
  });

  it("directs queues over 1,000 files to another S3 tool", () => {
    const files = Array.from(
      { length: S3_WEB_UPLOAD_MAX_FILES + 1 },
      (_, index) => candidate(`file-${index}`),
    );

    expect(s3WebUploadLimitError(files)).toBe(
      "The web UI supports up to 1,000 files in one upload. Use an S3-compatible client or CLI for larger operations.",
    );
  });

  it("directs files over 100 GB to another S3 tool", () => {
    expect(
      s3WebUploadLimitError([
        candidate("archive.raw", S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES + 1),
      ]),
    ).toBe(
      "archive.raw exceeds the 100 GB web UI upload limit. Use an S3-compatible client or CLI for larger operations.",
    );
  });

  it("guards upload engines before they start work", () => {
    expect(() =>
      assertS3WebUploadLimits([
        {
          file: candidate(
            "archive.raw",
            S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES + 1,
          ) as File,
          key: "archive.raw",
        },
      ]),
    ).toThrow("100 GB web UI upload limit");
  });
});
