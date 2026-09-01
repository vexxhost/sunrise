import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { clusterTemplateQueryOptions } from "@/hooks/queries/useMagnum";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { ClusterTemplateDetailClient } from "./ClusterTemplateDetailClient";

interface ClusterTemplatePageProps {
  params: Promise<{ id: string }>;
}

export default async function ClusterTemplatePage({
  params,
}: ClusterTemplatePageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const templateQuery = clusterTemplateQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  try {
    await queryClient.fetchQuery(templateQuery);
  } catch {
    notFound();
  }

  return (
    <PrefetchHydrationBoundary
      queries={[templateQuery]}
      queryClient={queryClient}
    >
      <ClusterTemplateDetailClient
        projectId={session.projectId}
        regionId={session.regionId}
        templateId={id}
      />
    </PrefetchHydrationBoundary>
  );
}
