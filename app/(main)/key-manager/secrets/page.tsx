import { isCreateActionRequested } from "@/lib/create-actions";
import { listSecrets } from "@/lib/openstack/barbican-server";
import { getSession } from "@/lib/session";
import { SecretsClient } from "./SecretsClient";

export const dynamic = "force-dynamic";

export default async function SecretsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const [session, initialData] = await Promise.all([
    getSession(),
    listSecrets(),
  ]);
  return (
    <SecretsClient
      projectId={session.projectId ?? ""}
      regionId={session.regionId ?? ""}
      initialData={initialData}
      initiallyCreateOpen={isCreateActionRequested(
        (await searchParams).create,
        "secret",
      )}
    />
  );
}
