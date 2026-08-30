import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { keypairQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";

import { KeyPairDetailClient } from "./KeyPairDetailClient";

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

  try {
    await queryClient.fetchQuery(keyPairQuery);
  } catch {
    notFound();
  }

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
