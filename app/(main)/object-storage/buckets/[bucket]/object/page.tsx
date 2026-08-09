import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ bucket: string }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);

  redirect(`/object-storage/buckets/${encodeURIComponent(bucket)}`);
}
