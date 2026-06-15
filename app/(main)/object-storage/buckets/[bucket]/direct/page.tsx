import { redirect } from 'next/navigation';
import { DirectClient } from './DirectClient';
import { getSession } from '@/lib/session';
import { ensureActiveProjectS3Credentials } from '@/lib/s3/session';

interface PageProps {
  params: Promise<{ bucket: string }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);

  // Server-side preflight: if no STS creds in session, kick off OIDC.
  const session = await getSession();
  const { creds } = await ensureActiveProjectS3Credentials(session);

  if (!creds) {
    redirect('/object-storage/auth/login');
  }

  return <DirectClient bucket={bucket} />;
}
