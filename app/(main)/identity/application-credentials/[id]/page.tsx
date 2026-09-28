import { redirect } from "next/navigation";
import { getApplicationCredentialAction } from "@/lib/openstack/application-credentials";
import { getSession } from "@/lib/session";
import { ApplicationCredentialDetailClient } from "./ApplicationCredentialDetailClient";

export const dynamic = "force-dynamic";

export default async function ApplicationCredentialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [credential, session] = await Promise.all([
    getApplicationCredentialAction(id),
    getSession(),
  ]);

  if (!credential) redirect("/identity/application-credentials");

  return (
    <ApplicationCredentialDetailClient
      credential={credential}
      projectId={session.projectId ?? ""}
      regionId={session.regionId ?? ""}
    />
  );
}
