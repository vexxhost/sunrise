import { redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { ObjectDetailClient } from './ObjectDetailClient';
import { objectMetadataQueryOptions } from '@/hooks/queries/useObjects';
import { headObject } from '@/lib/s3/actions';
import { makeQueryClient } from '@/lib/query-client';

interface PageProps {
  params: Promise<{ bucket: string; key: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket, key: rawKeyParts } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = rawKeyParts.map((p) => decodeURIComponent(p)).join('/');

  const probe = await headObject(bucket, objectKey);
  if (!probe.ok && probe.needsAuth) {
    redirect('/object-storage/auth/login');
  }

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(objectMetadataQueryOptions(bucket, objectKey));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ObjectDetailClient bucket={bucket} objectKey={objectKey} />
    </HydrationBoundary>
  );
}
