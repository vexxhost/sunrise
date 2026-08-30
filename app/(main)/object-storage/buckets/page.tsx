import { BucketsClient } from './BucketsClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { listBucketsForRender } from '@/lib/s3/actions';
import { getSession, normalizeProjectId } from '@/lib/session';

export default async function Page() {
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);
  const activeRegionId = session.regionId ?? '';

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
      activeProjectId={activeProjectId}
      activeRegionId={activeRegionId}
      initialData={{
        buckets: probe.buckets,
        accessDenied: probe.accessDenied ?? false,
      }}
    />
  );
}
