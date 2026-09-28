import { isCreateActionRequested } from "@/lib/create-actions";
import { listApplicationCredentialsAction } from "@/lib/openstack/application-credentials";
import { getSession } from "@/lib/session";
import { ApplicationCredentialsClient } from "./ApplicationCredentialsClient";

export const dynamic = "force-dynamic";

export default async function ApplicationCredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "application-credential",
  );
  const initialData = await listApplicationCredentialsAction();

  return (
    <ApplicationCredentialsClient
      key={createRequested ? "create" : "idle"}
      activeProjectId={session.projectId ?? ""}
      activeRegionId={session.regionId ?? ""}
      initiallyCreateOpen={createRequested}
      initialData={initialData}
    />
  );
}
