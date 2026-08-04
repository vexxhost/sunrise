import { ObjectsClient } from './ObjectsClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { DataTableHeader } from '@/components/DataTable/Header';
import { listObjectsForRender } from '@/lib/s3/actions';
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

  const probe = await listObjectsForRender(bucket, prefix);
  if (!probe.ok && probe.needsAuth) {
    return <ObjectStorageAuthRedirect />;
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
