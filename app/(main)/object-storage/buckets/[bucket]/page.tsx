import { redirect } from 'next/navigation';
import { ObjectsClient } from './ObjectsClient';
import { DataTableHeader } from '@/components/DataTable/Header';
import { listObjects } from '@/lib/s3/actions';
import { getSession, normalizeProjectId } from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ prefix?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { bucket: rawBucket } = await params;
  const { prefix: rawPrefix } = await searchParams;
  const bucket = decodeURIComponent(rawBucket);
  const prefix = rawPrefix ?? '';
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);

  const probe = await listObjects(bucket, prefix);
  if (!probe.ok && probe.needsAuth) {
    redirect('/object-storage/auth/login');
  }
  if (!probe.ok) {
    throw new Error(probe.error);
  }

  return (
    <>
      <DataTableHeader resourceName="object" actions={undefined} />
      <ObjectsClient
        activeProjectId={activeProjectId}
        bucket={bucket}
        initialPrefix={prefix}
        initialData={probe}
      />
    </>
  );
}
