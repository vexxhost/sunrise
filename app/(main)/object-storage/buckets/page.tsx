import { redirect } from 'next/navigation';
import { BucketsClient } from './BucketsClient';
import { DataTableHeader } from '@/components/DataTable/Header';
import { listBuckets } from '@/lib/s3/actions';
import { getSession, normalizeProjectId } from '@/lib/session';

export default async function Page() {
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);

  // Pre-flight auth check on the server so we can redirect to OIDC cleanly
  const probe = await listBuckets();
  if (!probe.ok && probe.needsAuth) {
    redirect('/object-storage/auth/login');
  }
  if (!probe.ok) {
    throw new Error(probe.error);
  }

  return (
    <>
      <DataTableHeader resourceName="bucket" actions={undefined} />
      <BucketsClient
        activeProjectId={activeProjectId}
        initialData={{
          buckets: probe.buckets,
          accessDenied: probe.accessDenied ?? false,
        }}
      />
    </>
  );
}
