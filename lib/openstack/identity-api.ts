import "server-only";

export function versionedIdentityApiUrl(
  value: string | undefined,
  name: string,
) {
  const base = value?.trim().replace(/\/+$/, "");
  if (!base) throw new Error(`${name} is not configured`);

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(
      `${name} must not contain credentials, query parameters, or a fragment`,
    );
  }

  return base.endsWith("/v3") ? base : `${base}/v3`;
}

export function identityApiUrl(value = process.env.KEYSTONE_API) {
  return versionedIdentityApiUrl(value, "KEYSTONE_API");
}

export function publicIdentityApiUrl(value = process.env.KEYSTONE_PUBLIC_API) {
  return versionedIdentityApiUrl(value, "KEYSTONE_PUBLIC_API");
}
