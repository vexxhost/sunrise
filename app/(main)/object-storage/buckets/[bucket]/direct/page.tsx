import { redirect } from 'next/navigation';
import { DirectClient } from './DirectClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { DataTableHeader } from '@/components/DataTable/Header';
import { RecentResourceTracker } from '@/components/resources/RecentResourceTracker';
import { directObjectPath } from '@/lib/s3/direct-route';
import { getActiveS3Credentials, getSession } from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ inspect?: string | string[] }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const { inspect } = await searchParams;

  if (typeof inspect === 'string' && inspect.length > 0) {
    redirect(directObjectPath(bucket, inspect));
  }

  // Server-side preflight: if no STS creds exist, hand off to OIDC in-browser.
  const session = await getSession();
  const creds = getActiveS3Credentials(session);

  if (!creds) {
    return <ObjectStorageAuthRedirect />;
  }

  return (
    <>
      <RecentResourceTracker kind="bucket" id={bucket} name={bucket} />
      <DataTableHeader resourceName="object" actions={undefined} />
      <DirectClient bucket={bucket} />
    </>
  );
}
