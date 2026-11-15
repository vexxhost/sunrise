import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { userMessageQueryOptions } from "@/hooks/queries/useManila";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { UserMessageDetailClient } from "./UserMessageDetailClient";

export default async function UserMessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const messageQuery = userMessageQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(messageQuery), {
    kind: "user-message",
    id,
  });

  return (
    <PrefetchHydrationBoundary
      queries={[messageQuery]}
      queryClient={queryClient}
    >
      <UserMessageDetailClient
        messageId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
