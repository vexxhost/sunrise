import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import {
  floatingIpQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { FloatingIpDetailClient } from "./FloatingIpDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session.projectId || !session.regionId) return null;
  const queryClient = makeQueryClient();
  const floatingIpQuery = floatingIpQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(floatingIpQuery),
    { kind: "floating-ip", id },
  );
  await queryClient.prefetchQuery(
    portsQueryOptions(session.regionId, session.projectId),
  );
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FloatingIpDetailClient
        id={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </HydrationBoundary>
  );
}
