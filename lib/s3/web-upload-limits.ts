import type { S3UploadFile } from "@/lib/s3/upload-batch";

const GIGABYTE = 1_000_000_000;

export const S3_WEB_UPLOAD_MAX_FILES = 1000;
export const S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES = 100 * GIGABYTE;

interface S3WebUploadCandidate {
  name: string;
  size: number;
}

export function s3WebUploadLimitError(
  files: readonly S3WebUploadCandidate[],
) {
  if (files.length > S3_WEB_UPLOAD_MAX_FILES) {
    return `The web UI supports up to ${S3_WEB_UPLOAD_MAX_FILES.toLocaleString("en-US")} files in one upload. Use an S3-compatible client or CLI for larger operations.`;
  }

  const oversized = files.find(
    (file) => file.size > S3_WEB_UPLOAD_MAX_FILE_SIZE_BYTES,
  );
  if (oversized) {
    return `${oversized.name} exceeds the 100 GB web UI upload limit. Use an S3-compatible client or CLI for larger operations.`;
  }

  return null;
}

export function assertS3WebUploadLimits(files: readonly S3UploadFile[]) {
  const error = s3WebUploadLimitError(
    files.map(({ file }) => ({ name: file.name, size: file.size })),
  );
  if (error) throw new Error(error);
}
