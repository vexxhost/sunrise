import { redirect } from 'next/navigation';

interface Params {
  id: string;
}

export default async function Instance({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  redirect(`/compute/instances/${id}/overview`);
}
