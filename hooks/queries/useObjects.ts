import { queryOptions } from '@tanstack/react-query';
import { listObjects, headObject } from '@/lib/s3/actions';

export function objectsQueryOptions(
  projectId: string,
  bucket: string,
  prefix: string
) {
  return queryOptions({
    queryKey: ['s3', projectId, 'objects', bucket, prefix],
    queryFn: async () => {
      const res = await listObjects(bucket, prefix);
      if (!res.ok) {
        if (res.needsAuth) {
          if (typeof window !== 'undefined') {
            window.location.href = '/object-storage/auth/login';
          }
          throw new Error('S3 authentication required');
        }
        throw new Error(res.error);
      }
      return res;
    },
    retry: false,
  });
}

export function objectMetadataQueryOptions(
  projectId: string,
  bucket: string,
  key: string
) {
  return queryOptions({
    queryKey: ['s3', projectId, 'object', bucket, key],
    queryFn: async () => {
      const res = await headObject(bucket, key);
      if (!res.ok) {
        if (res.needsAuth) {
          if (typeof window !== 'undefined') {
            window.location.href = '/object-storage/auth/login';
          }
          throw new Error('S3 authentication required');
        }
        throw new Error(res.error);
      }
      return res.data;
    },
    retry: false,
  });
}
