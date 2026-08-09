export function normalizeStorageClass(
  storageClass: string | null | undefined
): string {
  return storageClass ?? 'STANDARD';
}
