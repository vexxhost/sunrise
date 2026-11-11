const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;
const TEBIBYTE = 1024 * GIBIBYTE;

export type S3UploadMode = "direct" | "proxy";

export const S3_MULTIPART_THRESHOLD_BYTES = 100 * MEBIBYTE;
export const S3_MULTIPART_DEFAULT_PART_SIZE_BYTES = 16 * MEBIBYTE;
export const S3_PROXY_MULTIPART_THRESHOLD_BYTES = 8 * MEBIBYTE;
export const S3_PROXY_MULTIPART_PART_SIZE_BYTES = 8 * MEBIBYTE;
export const S3_MULTIPART_MAX_PART_SIZE_BYTES = 5 * GIBIBYTE;
export const S3_MULTIPART_MAX_PARTS = 10_000;
export const S3_MAX_OBJECT_SIZE_BYTES = 5 * TEBIBYTE;
export const S3_MULTIPART_CONCURRENCY = 4;
export const S3_PROXY_MULTIPART_CONCURRENCY = 2;

export function shouldUseS3MultipartUpload(
  size: number,
  mode: S3UploadMode = "direct",
) {
  const threshold =
    mode === "proxy"
      ? S3_PROXY_MULTIPART_THRESHOLD_BYTES
      : S3_MULTIPART_THRESHOLD_BYTES;
  return size >= threshold;
}

export function s3MultipartPartSize(
  size: number,
  mode: S3UploadMode = "direct",
) {
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("Object size must be a non-negative finite number");
  }
  if (size > S3_MAX_OBJECT_SIZE_BYTES) {
    throw new Error("Object exceeds the S3 maximum size of 5 TiB");
  }

  const minimumForPartLimit = Math.ceil(size / S3_MULTIPART_MAX_PARTS);
  const roundedMinimum = Math.ceil(minimumForPartLimit / MEBIBYTE) * MEBIBYTE;
  const partSize = Math.max(
    mode === "proxy"
      ? S3_PROXY_MULTIPART_PART_SIZE_BYTES
      : S3_MULTIPART_DEFAULT_PART_SIZE_BYTES,
    roundedMinimum,
  );

  if (partSize > S3_MULTIPART_MAX_PART_SIZE_BYTES) {
    throw new Error("Object is too large for an S3 multipart upload");
  }

  return partSize;
}
