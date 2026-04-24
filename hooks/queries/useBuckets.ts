import { queryOptions } from '@tanstack/react-query';
import { listBuckets } from '@/lib/s3/actions';

export function bucketsQueryOptions() {
  return queryOptions({
    queryKey: ['s3', 'buckets'],
    queryFn: async () => {
      const res = await listBuckets();
      if (!res.ok) {
        if (res.needsAuth) {
          if (typeof window !== 'undefined') {
            window.location.href = '/object-storage/auth/login';
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
