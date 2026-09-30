import { isCreateActionRequested } from "@/lib/create-actions";
import { listContainers, listSecrets } from "@/lib/openstack/barbican-server";
import { getSession } from "@/lib/session";
import { ContainersClient } from "./ContainersClient";

export const dynamic = "force-dynamic";

export default async function ContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const [session, initialData, secrets] = await Promise.all([
    getSession(),
    listContainers(),
    listSecrets(),
  ]);
  return (
    <ContainersClient
      projectId={session.projectId ?? ""}
      regionId={session.regionId ?? ""}
      initialData={initialData}
      secrets={secrets.items}
      initiallyCreateOpen={isCreateActionRequested(
        (await searchParams).create,
        "secret-container",
      )}
    />
  );
}
