import { getSession } from "@/lib/session";
import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import { ClusterTemplateActions } from "@/components/Kubernetes/ClusterTemplateActions";
import { TemplatesClient } from "./TemplatesClient";
import { isCreateActionRequested } from "@/lib/create-actions";

export default async function ClusterTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "cluster-template",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="cluster template"
      actions={
        <ClusterTemplateActions
          key={createRequested ? "create" : "idle"}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
        />
      }
      queries={[
        clusterTemplatesQueryOptions(session.regionId, session.projectId),
        imagesQueryOptions(session.regionId, session.projectId),
        flavorsQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <TemplatesClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
