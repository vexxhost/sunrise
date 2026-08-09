import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ bucket: string }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket } = await params;
  redirect(`/object-storage/buckets/${encodeURIComponent(bucket)}/direct`);
}
