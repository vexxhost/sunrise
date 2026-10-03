import { queryOptions } from '@tanstack/react-query';
import { listBuckets } from '@/lib/s3/actions';
import { startObjectStorageCredentialRefresh } from '@/lib/s3/auth-navigation';

export function bucketsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: ['s3', projectId, 'buckets'],
    queryFn: async () => {
      const res = await listBuckets();
      if (!res.ok) {
        if (res.needsAuth) {
          if (typeof window !== 'undefined') {
            startObjectStorageCredentialRefresh();
          }
          throw new Error('S3 authentication required');
        }
        throw new Error(res.error);
      }
      return {
        buckets: res.buckets,
        accessDenied: res.accessDenied ?? false,
      };
    },
    retry: false,
  });
}
