import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { orderQueryOptions } from "@/hooks/queries/useBarbican";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { OrderDetailClient } from "./OrderDetailClient";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const query = orderQueryOptions(session.regionId, session.projectId, id);
  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
    kind: "secret-order",
    id,
  });
  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <OrderDetailClient
        orderId={id}
        projectId={session.projectId ?? ""}
        regionId={session.regionId ?? ""}
      />
    </PrefetchHydrationBoundary>
  );
}
