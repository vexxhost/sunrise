import { redirect } from 'next/navigation';
import { ObjectsClient } from './ObjectsClient';
import { objectsQueryOptions } from '@/hooks/queries/useObjects';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { listObjects } from '@/lib/s3/actions';

interface PageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ prefix?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { bucket: rawBucket } = await params;
  const { prefix: rawPrefix } = await searchParams;
  const bucket = decodeURIComponent(rawBucket);
  const prefix = rawPrefix ?? '';

  const probe = await listObjects(bucket, prefix);
  if (!probe.ok && probe.needsAuth) {
    redirect('/object-storage/auth/login');
  }

  return (
    <DataTableHydrationBoundary
      resourceName="object"
      queries={[objectsQueryOptions(bucket, prefix)]}
    >
      <ObjectsClient bucket={bucket} />
    </DataTableHydrationBoundary>
  );
}
