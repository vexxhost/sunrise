import { ObjectStorageAuthRedirect } from "@/components/Auth/ObjectStorageAuthRedirect";
import { requireS3Backend } from "@/components/services/ServiceGuards";
import { isCreateActionRequested } from "@/lib/create-actions";
import { getSession, normalizeProjectId } from "@/lib/session";
import { listRolesForRender } from "@/lib/s3/role-actions";
import { RolesClient } from "./RolesClient";

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  await requireS3Backend();
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);
  const activeRegionId = session.regionId ?? "";
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "role",
  );
  const result = await listRolesForRender();

  if (!result.ok && result.needsAuth) {
    return <ObjectStorageAuthRedirect />;
  }
  if (!result.ok) {
    throw new Error(result.error);
  }

  return (
    <RolesClient
      key={createRequested ? "create" : "idle"}
      activeProjectId={activeProjectId}
      activeRegionId={activeRegionId}
      initiallyCreateOpen={createRequested}
      initialData={{
        roles: result.roles,
        activeRoleArn: result.activeRoleArn,
        accessDenied: result.accessDenied,
        denialRequestId: result.denialRequestId,
      }}
    />
  );
}
