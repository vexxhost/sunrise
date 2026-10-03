import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { securityServiceQueryOptions } from "@/hooks/queries/useManila";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { SecurityServiceDetailClient } from "./SecurityServiceDetailClient";

export default async function SecurityServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const query = securityServiceQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
    kind: "security-service",
    id,
  });

  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <SecurityServiceDetailClient
        serviceId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
