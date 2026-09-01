import { redirect } from "next/navigation";
import { ClusterDetailPage } from "../ClusterDetailPage";
import { isKubernetesClusterDetailTab } from "../tabs";

interface ClusterTabPageProps {
  params: Promise<{ id: string; tab: string }>;
}

export default async function ClusterTabPage({ params }: ClusterTabPageProps) {
  const { id, tab } = await params;

  if (tab === "node-pools") {
    redirect(`/kubernetes/clusters/${id}/node-groups`);
  }

  if (tab === "components" || tab === "template" || tab === "configuration") {
    redirect(`/kubernetes/clusters/${id}/add-ons`);
  }

  if (tab === "authority" || tab === "access") {
    redirect(`/kubernetes/clusters/${id}/security`);
  }

  if (!isKubernetesClusterDetailTab(tab)) {
    redirect(`/kubernetes/clusters/${id}/overview`);
  }

  return <ClusterDetailPage id={id} activeTab={tab} />;
}
