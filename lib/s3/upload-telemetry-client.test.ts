import { describe, expect, it } from "vitest";
import { S3_MULTIPART_THRESHOLD_BYTES } from "@/lib/s3/multipart-policy";
import { buildS3UploadMetrics } from "@/lib/s3/upload-telemetry-client";

function uploadFile(name: string, size: number) {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size });
  return { file, key: `private/${name}` };
}

describe("S3 upload telemetry", () => {
  it("reports bounded dimensions without resource identifiers", () => {
    const files = [
      uploadFile("large-secret.raw", S3_MULTIPART_THRESHOLD_BYTES),
    ];
    const metrics = buildS3UploadMetrics("direct", files, {
      batchPercentage: 50,
      bytesPerSecond: 1024,
      files: [
        {
          durationSeconds: 12,
          index: 0,
          key: "private/large-secret.raw",
          loadedBytes: S3_MULTIPART_THRESHOLD_BYTES / 2,
          totalBytes: S3_MULTIPART_THRESHOLD_BYTES,
          percentage: 50,
          state: "cancelled",
        },
      ],
    });

    expect(metrics).toEqual([
      {
        bytes: S3_MULTIPART_THRESHOLD_BYTES / 2,
        durationSeconds: 12,
        mode: "direct",
        outcome: "cancelled",
        parts: 4,
        strategy: "multipart",
      },
    ]);
    expect(JSON.stringify(metrics)).not.toContain("large-secret");
    expect(JSON.stringify(metrics)).not.toContain("private");
  });

  it("classifies medium proxy uploads as multipart", () => {
    const size = 24 * 1024 * 1024;
    const files = [uploadFile("medium.raw", size)];

    expect(
      buildS3UploadMetrics("proxy", files, {
        batchPercentage: 100,
        bytesPerSecond: 2048,
        files: [
          {
            durationSeconds: 4,
            index: 0,
            key: "medium.raw",
            loadedBytes: size,
            totalBytes: size,
            percentage: 100,
            state: "complete",
          },
        ],
      }),
    ).toEqual([
      {
        bytes: size,
        durationSeconds: 4,
        mode: "proxy",
        outcome: "success",
        parts: 3,
        strategy: "multipart",
      },
    ]);
  });
});
