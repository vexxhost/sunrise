import "server-only";

export function s3DirectBrowser(
  value = process.env.SUNRISE_S3_DIRECT_BROWSER,
) {
  const normalized = value?.trim().toLowerCase() || "false";
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("SUNRISE_S3_DIRECT_BROWSER must be true or false");
}
