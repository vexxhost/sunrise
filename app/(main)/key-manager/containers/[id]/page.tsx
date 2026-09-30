import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { containerQueryOptions } from "@/hooks/queries/useBarbican";
import { listSecrets } from "@/lib/openstack/barbican-server";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { ContainerDetailClient } from "./ContainerDetailClient";

export const dynamic = "force-dynamic";

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const query = containerQueryOptions(session.regionId, session.projectId, id);
  const [, secrets] = await Promise.all([
    fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
      kind: "secret-container",
      id,
    }),
    listSecrets(),
  ]);
  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <ContainerDetailClient
        containerId={id}
        projectId={session.projectId ?? ""}
        regionId={session.regionId ?? ""}
        secrets={secrets.items}
      />
    </PrefetchHydrationBoundary>
  );
}
