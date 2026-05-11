import { redirect } from 'next/navigation';
import { BucketsClient } from './BucketsClient';
import { bucketsQueryOptions } from '@/hooks/queries/useBuckets';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { listBuckets } from '@/lib/s3/actions';

export default async function Page() {
  // Pre-flight auth check on the server so we can redirect to OIDC cleanly
  const probe = await listBuckets();
  if (!probe.ok && probe.needsAuth) {
    redirect('/object-storage/auth/login');
  }

  return (
    <DataTableHydrationBoundary
      resourceName="bucket"
      queries={[bucketsQueryOptions()]}
    >
      <BucketsClient />
    </DataTableHydrationBoundary>
  );
}
