export const OBJECT_STORAGE_AUTH_REFRESH_PATH = "/object-storage/auth/refresh";

export function objectStorageAuthRefreshHref(returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `${OBJECT_STORAGE_AUTH_REFRESH_PATH}?${params.toString()}`;
}

export function startObjectStorageCredentialRefresh(): void {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(objectStorageAuthRefreshHref(returnTo));
}
