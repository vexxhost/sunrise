import { notFound, redirect } from "next/navigation";
import { loadCloudContext } from "@/lib/cloud-context";
import { getServicePolicy } from "@/lib/deployment-config";
import {
  isServiceEnabled,
  isSunriseServiceEnabled,
  type OpenStackServiceId,
  type SunriseServiceId,
} from "@/lib/service-policy";
import { getSession } from "@/lib/session";

export async function ConfiguredService({
  id,
  children,
}: {
  id: OpenStackServiceId;
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!isServiceEnabled(getServicePolicy(), id, session.regionId)) {
    notFound();
  }
  return children;
}

export async function ConfiguredServiceGroup({
  id,
  children,
}: {
  id: SunriseServiceId;
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!isSunriseServiceEnabled(getServicePolicy(), id, session.regionId)) {
    notFound();
  }
  return children;
}

export async function S3BackendOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireS3Backend();
  return children;
}

export async function requireS3Backend() {
  const { snapshot } = await loadCloudContext();
  if (snapshot.objectStorage.backend !== "s3") {
    redirect("/object-storage");
  }
}
