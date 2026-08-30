import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  networkQueryOptions,
  portQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { PortDetailClient } from "./PortDetailClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  const port = await queryClient.fetchQuery(
    portQueryOptions(session.regionId, session.projectId, id),
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
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PortDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </HydrationBoundary>
  );
}
