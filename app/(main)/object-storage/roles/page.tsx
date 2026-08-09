import { ObjectStorageAuthRedirect } from '@/components/Auth/ObjectStorageAuthRedirect';
import { DataTableHeader } from '@/components/DataTable/Header';
import { getSession, normalizeProjectId } from '@/lib/session';
import { listRolesForRender } from '@/lib/s3/role-actions';
import { RolesClient } from './RolesClient';

export default async function RolesPage() {
  const session = await getSession();
  const activeProjectId = normalizeProjectId(session.projectId);
  const result = await listRolesForRender();

  if (!result.ok && result.needsAuth) {
    return <ObjectStorageAuthRedirect />;
  }
  if (!result.ok) {
    throw new Error(result.error);
  }

  return (
    <>
      <DataTableHeader resourceName="role" actions={undefined} />
      <RolesClient
        activeProjectId={activeProjectId}
        initialData={{
          roles: result.roles,
          accessDenied: result.accessDenied,
          denialRequestId: result.denialRequestId,
        }}
      />
    </>
  );
}
