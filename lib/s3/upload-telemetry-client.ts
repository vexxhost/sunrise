import {
  s3MultipartPartSize,
  shouldUseS3MultipartUpload,
} from "@/lib/s3/multipart-policy";
import type { S3UploadFile, S3UploadProgress } from "@/lib/s3/upload-batch";
import type { S3UploadMetric } from "@/lib/s3/upload-telemetry";

export function buildS3UploadMetrics(
  mode: "proxy" | "direct",
  files: S3UploadFile[],
  progress: S3UploadProgress | null,
): S3UploadMetric[] {
  if (!progress) return [];
  return progress.files.map((state) => {
    const file = files[state.index].file;
    const multipart = shouldUseS3MultipartUpload(file.size, mode);
    const partSize = multipart
      ? s3MultipartPartSize(file.size, mode)
      : file.size;
    return {
      bytes: state.loadedBytes,
      durationSeconds: state.durationSeconds,
      mode,
      outcome:
        state.state === "complete"
          ? ("success" as const)
          : state.state === "cancelled"
            ? ("cancelled" as const)
            : ("error" as const),
      parts:
        state.loadedBytes > 0
          ? Math.max(1, Math.ceil(state.loadedBytes / Math.max(1, partSize)))
          : 0,
      strategy: multipart ? ("multipart" as const) : ("single" as const),
    };
  });
}
