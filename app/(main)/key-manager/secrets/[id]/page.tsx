import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { secretQueryOptions } from "@/hooks/queries/useBarbican";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { SecretDetailClient } from "./SecretDetailClient";

export const dynamic = "force-dynamic";

export default async function SecretDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const query = secretQueryOptions(session.regionId, session.projectId, id);
  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
    kind: "secret",
    id,
  });
  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <SecretDetailClient
        secretId={id}
        projectId={session.projectId ?? ""}
        regionId={session.regionId ?? ""}
      />
    </PrefetchHydrationBoundary>
  );
}
