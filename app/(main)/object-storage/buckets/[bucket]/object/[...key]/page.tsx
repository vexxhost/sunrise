import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { ObjectDetailClient } from './ObjectDetailClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { objectMetadataQueryOptions } from '@/hooks/queries/useObjects';
import { headObjectForRender } from '@/lib/s3/actions';
import { makeQueryClient } from '@/lib/query-client';
import { getSession, normalizeProjectId } from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string; key: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket, key: rawKeyParts } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = rawKeyParts.map((p) => decodeURIComponent(p)).join('/');
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);

  const probe = await headObjectForRender(bucket, objectKey);
  if (!probe.ok && probe.needsAuth) {
    return <ObjectStorageAuthRedirect />;
  }

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    objectMetadataQueryOptions(activeProjectId, bucket, objectKey)
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ObjectDetailClient
        activeProjectId={activeProjectId}
        bucket={bucket}
        objectKey={objectKey}
      />
    </HydrationBoundary>
  );
}
