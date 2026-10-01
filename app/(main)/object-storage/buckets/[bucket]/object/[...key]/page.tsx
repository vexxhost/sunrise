import { ObjectDetailClient } from "./ObjectDetailClient";
import { ObjectStorageAuthRedirect } from "@/components/Auth/ObjectStorageAuthRedirect";
import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { objectMetadataQueryOptions } from "@/hooks/queries/useObjects";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { headObjectForRender } from "@/lib/s3/actions";
import { makeQueryClient } from "@/lib/query-client";
import { getSession, normalizeProjectId } from "@/lib/session";
import { recoverMissingResource } from "@/lib/resource-recovery-server";

interface PageProps {
  params: Promise<{ bucket: string; key: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { bucket: rawBucket, key: rawKeyParts } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = rawKeyParts.map((p) => decodeURIComponent(p)).join("/");
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);

  const probe = await headObjectForRender(bucket, objectKey);
  if (!probe.ok && probe.needsAuth) {
    return <ObjectStorageAuthRedirect />;
  }
  if (!probe.ok && probe.notFound) {
    await recoverMissingResource({
      kind: "object",
      id: objectKey,
      parentId: bucket,
    });
  }
  if (!probe.ok) {
    throw new Error(probe.error);
  }

  const queryClient = makeQueryClient();
  queryClient.prefetchQuery(
    objectMetadataQueryOptions(activeProjectId, bucket, objectKey),
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);

  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <ObjectDetailClient
        activeProjectId={activeProjectId}
        bucket={bucket}
        objectKey={objectKey}
      />
    </QueryHydrationBoundary>
  );
}
