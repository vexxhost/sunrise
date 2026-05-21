import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { makeQueryClient } from "@/lib/query-client";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { ImageDetailClient } from "./ImageDetailClient";

interface ImagePageProps {
  params: Promise<{ id: string }>;
}

export default async function ImagePage({ params }: ImagePageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const imageQuery = imageQueryOptions(session.regionId, session.projectId, id);

  try {
    await queryClient.fetchQuery(imageQuery);
  } catch {
    notFound();
  }

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
