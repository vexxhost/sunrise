import { redirect } from 'next/navigation';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { DataTableHeader } from '@/components/DataTable/Header';
import { getActiveS3Credentials, getSession } from '@/lib/session';

import { DirectClient } from '../DirectClient';

interface PageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const [{ bucket: rawBucket }, { key }] = await Promise.all([
    params,
    searchParams,
  ]);
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = typeof key === 'string' ? key : null;

  if (objectKey === null) {
    redirect(`/object-storage/buckets/${encodeURIComponent(bucket)}/direct`);
  }

  const session = await getSession();
  const creds = getActiveS3Credentials(session);

  if (!creds) {
    return <ObjectStorageAuthRedirect />;
  }

  return (
    <>
      <DataTableHeader resourceName="object" actions={undefined} />
      <DirectClient bucket={bucket} objectKey={objectKey} />
    </>
  );
}
