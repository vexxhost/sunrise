import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { keypairQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";

import { KeyPairDetailClient } from "./KeyPairDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

interface KeyPairPageProps {
  params: Promise<{ name: string }>;
}

export default async function KeyPairPage({ params }: KeyPairPageProps) {
  const { name } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const keyPairQuery = keypairQueryOptions(
    session.regionId,
    session.projectId,
    name,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(keyPairQuery), {
    kind: "key-pair",
    id: name,
  });

  return (
    <PrefetchHydrationBoundary
      queries={[keyPairQuery]}
      queryClient={queryClient}
    >
      <KeyPairDetailClient
        name={name}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
