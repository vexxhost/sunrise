import { redirect } from "next/navigation";

interface ClusterPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClusterPage({ params }: ClusterPageProps) {
  const { id } = await params;
  redirect(`/kubernetes/clusters/${id}/overview`);
}
