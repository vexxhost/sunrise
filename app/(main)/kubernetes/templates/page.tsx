import { getSession } from "@/lib/session";
import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import { ClusterTemplateActions } from "@/components/Kubernetes/ClusterTemplateActions";
import { TemplatesClient } from "./TemplatesClient";

export default async function ClusterTemplatesPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="cluster template"
      actions={
        <ClusterTemplateActions
          regionId={session.regionId}
          projectId={session.projectId}
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
