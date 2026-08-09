export function directObjectPath(bucket: string, objectKey: string) {
  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `/object-storage/buckets/${encodeURIComponent(
    bucket
  )}/direct/object/${encodedKey}`;
}
