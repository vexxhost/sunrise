import { DirectClient } from './DirectClient';
import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { getActiveS3Credentials, getSession } from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);

  // Server-side preflight: if no STS creds exist, hand off to OIDC in-browser.
  const session = await getSession();
  const creds = getActiveS3Credentials(session);

  if (!creds) {
    return <ObjectStorageAuthRedirect />;
  }

  return <DirectClient bucket={bucket} />;
}
