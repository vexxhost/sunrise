import { BucketsClient } from './BucketsClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { listBucketsForRender } from '@/lib/s3/actions';
import { getSession, normalizeProjectId } from '@/lib/session';
import { isCreateActionRequested } from '@/lib/create-actions';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);
  const activeRegionId = session.regionId ?? '';
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    'bucket',
  );

  // Render a client handoff so Next does not request the auth handler as RSC.
  const probe = await listBucketsForRender();
  if (!probe.ok && probe.needsAuth) {
    return <ObjectStorageAuthRedirect />;
  }
  if (!probe.ok) {
    throw new Error(probe.error);
  }

  return (
    <BucketsClient
      key={createRequested ? 'create' : 'idle'}
      activeProjectId={activeProjectId}
      activeRegionId={activeRegionId}
      initiallyCreateOpen={createRequested}
      initialData={{
        buckets: probe.buckets,
        accessDenied: probe.accessDenied ?? false,
      }}
    />
  );
}
