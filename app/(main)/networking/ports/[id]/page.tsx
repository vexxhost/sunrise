import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  networkQueryOptions,
  portQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { PortDetailClient } from "./PortDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  const portQuery = portQueryOptions(session.regionId, session.projectId, id);
  const port = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(portQuery),
    { kind: "port", id },
  );
  await Promise.all([
    queryClient.prefetchQuery(
      networkQueryOptions(session.regionId, session.projectId, port.network_id),
    ),
    queryClient.prefetchQuery(
      securityGroupsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      serversQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <PortDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </QueryHydrationBoundary>
  );
}
