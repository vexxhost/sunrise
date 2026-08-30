import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { flavorQueryOptions } from "@/hooks/queries/useServers";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { FlavorDetailClient } from "./FlavorDetailClient";

interface FlavorPageProps {
  params: Promise<{ id: string }>;
}

export default async function FlavorPage({
  params,
}: FlavorPageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const flavorQuery = flavorQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  try {
    await queryClient.fetchQuery(flavorQuery);
  } catch {
    notFound();
  }

  return (
    <PrefetchHydrationBoundary queries={[flavorQuery]} queryClient={queryClient}>
      <FlavorDetailClient
        flavorId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
