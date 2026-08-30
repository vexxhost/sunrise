import { DirectClient } from '../../DirectClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { DataTableHeader } from '@/components/DataTable/Header';
import {
  getActiveS3Credentials,
  getSession,
  normalizeProjectId,
} from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string; key: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket, key: rawKeyParts } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = rawKeyParts.map((part) => decodeURIComponent(part)).join('/');

  const session = await getSession();
  const creds = getActiveS3Credentials(session);
  const activeProjectId = normalizeProjectId(session.projectId);
  const activeRegionId = session.regionId ?? '';

  if (!creds) {
    return <ObjectStorageAuthRedirect />;
  }

  return (
    <>
      <DataTableHeader resourceName="object" actions={undefined} />
      <DirectClient
        activeProjectId={activeProjectId}
        activeRegionId={activeRegionId}
        bucket={bucket}
        objectKey={objectKey}
      />
    </>
  );
}
