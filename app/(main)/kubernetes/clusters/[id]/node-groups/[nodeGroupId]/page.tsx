import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import {
  clusterNodeGroupsQueryOptions,
  clusterNodeGroupQueryOptions,
  clusterQueryOptions,
} from "@/hooks/queries/useMagnum";
import {
  flavorsQueryOptions,
  serversQueryOptions,
} from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { NodeGroupDetailClient } from "./NodeGroupDetailClient";

interface NodeGroupPageProps {
  params: Promise<{ id: string; nodeGroupId: string }>;
}

export default async function NodeGroupPage({ params }: NodeGroupPageProps) {
  const { id, nodeGroupId } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const clusterQuery = clusterQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const nodeGroupQuery = clusterNodeGroupQueryOptions(
    session.regionId,
    session.projectId,
    id,
    nodeGroupId,
  );
  const nodeGroupsQuery = clusterNodeGroupsQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const queries = [
    clusterQuery,
    nodeGroupQuery,
    nodeGroupsQuery,
    serversQueryOptions(session.regionId, session.projectId),
    flavorsQueryOptions(session.regionId, session.projectId),
    imagesQueryOptions(session.regionId, session.projectId),
  ];

  try {
    await Promise.all([
      queryClient.fetchQuery(clusterQuery),
      queryClient.fetchQuery(nodeGroupQuery),
    ]);
  } catch {
    notFound();
  }

  return (
    <PrefetchHydrationBoundary queries={queries} queryClient={queryClient}>
      <NodeGroupDetailClient
        clusterId={id}
        nodeGroupId={nodeGroupId}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
