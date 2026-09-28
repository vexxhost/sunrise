import "server-only";

function versionedIdentityApiUrl(value: string | undefined, name: string) {
  const base = value?.trim().replace(/\/$/, "");
  if (!base) throw new Error(`${name} is not configured`);
  return base.endsWith("/v3") ? base : `${base}/v3`;
}

export function identityApiUrl() {
  return versionedIdentityApiUrl(process.env.KEYSTONE_API, "KEYSTONE_API");
}

export function publicIdentityApiUrl() {
  return versionedIdentityApiUrl(
    process.env.NEXT_PUBLIC_KEYSTONE_API,
    "NEXT_PUBLIC_KEYSTONE_API",
  );
}
