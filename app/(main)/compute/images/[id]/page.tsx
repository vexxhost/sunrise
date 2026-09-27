import { getSession } from "@/lib/session";
import { makeQueryClient } from "@/lib/query-client";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { ImageDetailClient } from "./ImageDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

interface ImagePageProps {
  params: Promise<{ id: string }>;
}

export default async function ImagePage({ params }: ImagePageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const imageQuery = imageQueryOptions(session.regionId, session.projectId, id);

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(imageQuery), {
    kind: "image",
    id,
  });

  return (
    <PrefetchHydrationBoundary queries={[imageQuery]} queryClient={queryClient}>
      <ImageDetailClient
        imageId={id}
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </PrefetchHydrationBoundary>
  );
}
