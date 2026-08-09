export function directObjectPath(bucket: string, objectKey: string) {
  const basePath = `/object-storage/buckets/${encodeURIComponent(
    bucket
  )}/direct/object`;
  const segments = objectKey.split('/');

  // Browsers normalize period-only path segments before Next.js sees them.
  // Keep keys with path semantics in the query string so their exact S3 key
  // survives navigation.
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    return `${basePath}?key=${encodeURIComponent(objectKey)}`;
  }

  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${basePath}/${encodedKey}`;
}
