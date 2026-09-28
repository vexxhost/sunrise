import "server-only";

export function identityApiUrl() {
  const base = process.env.KEYSTONE_API?.trim().replace(/\/$/, "");
  if (!base) throw new Error("KEYSTONE_API is not configured");
  return base.endsWith("/v3") ? base : `${base}/v3`;
}
