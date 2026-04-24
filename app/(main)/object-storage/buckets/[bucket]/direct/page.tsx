import { redirect } from 'next/navigation';
import { DirectClient } from './DirectClient';
import { getSession } from '@/lib/session';

interface PageProps {
  params: Promise<{ bucket: string }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);

  // Server-side preflight: if no STS creds in session, kick off OIDC.
  const session = await getSession();
  if (!session.s3Sts || session.s3Sts.expiration - Date.now() < 60_000) {
    redirect('/object-storage/auth/login');
  }

  return <DirectClient bucket={bucket} />;
}
