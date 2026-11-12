import { describe, expect, it, vi } from "vitest";
import { runS3UploadBatch, uploadAbortError } from "@/lib/s3/upload-batch";

function file(name: string, size: number) {
  return new File([new Uint8Array(size)], name);
}

describe("runS3UploadBatch", () => {
  it("reports per-file and aggregate progress", async () => {
    const updates: number[] = [];
    const result = await runS3UploadBatch(
      [
        { file: file("first", 4), key: "first" },
        { file: file("second", 6), key: "second" },
      ],
      async (item, onProgress) => onProgress(item.file.size),
      String,
      (progress) => updates.push(progress.batchPercentage),
      new AbortController().signal,
    );

    expect(result).toEqual({ uploaded: 2, errors: [], cancelled: false });
    expect(updates.at(-1)).toBe(100);
  });

  it("continues after an individual file fails", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(undefined);

    const result = await runS3UploadBatch(
      [
        { file: file("first", 1), key: "first" },
        { file: file("second", 1), key: "second" },
      ],
      upload,
      (error) => (error as Error).message,
      () => undefined,
      new AbortController().signal,
    );

    expect(result).toEqual({
      uploaded: 1,
      errors: [{ key: "first", error: "failed" }],
      cancelled: false,
    });
  });

  it("stops the queue after cancellation", async () => {
    const upload = vi.fn().mockRejectedValue(uploadAbortError());

    const result = await runS3UploadBatch(
      [
        { file: file("first", 1), key: "first" },
        { file: file("second", 1), key: "second" },
      ],
      upload,
      String,
      () => undefined,
      new AbortController().signal,
    );

    expect(result.cancelled).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("reports rolling upload throughput", async () => {
    vi.useFakeTimers();
    try {
      const speeds: number[] = [];
      const result = runS3UploadBatch(
        [{ file: file("speed", 100), key: "speed" }],
        async (_item, onProgress) => {
          onProgress(50);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          onProgress(100);
        },
        String,
        (progress) => speeds.push(progress.bytesPerSecond),
        new AbortController().signal,
      );

      await vi.advanceTimersByTimeAsync(1000);
      await result;

      expect(speeds.some((speed) => speed >= 99 && speed <= 101)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
