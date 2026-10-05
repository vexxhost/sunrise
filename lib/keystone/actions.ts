"use server";

import { revalidatePath } from "next/cache";
import {
  clearS3Credentials,
  getS3CredentialsForProject,
  getSession,
} from "@/lib/session";
import { writePrefs } from "@/lib/prefs";
import { preferenceIdentityFromSession } from "@/lib/preference-identity";
import type { Region, Project } from "@/types/openstack";
import { getProjectScopedTokenContext } from "@/lib/keystone/login";
import { refreshActiveProjectS3Credentials } from "@/lib/s3/session";
import { getServicePolicy } from "@/lib/deployment-config";
import { getServiceCatalog } from "@/lib/openstack/catalog";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import {
  isObjectStorageBackendEnabled,
  isSunriseServiceEnabled,
} from "@/lib/service-policy";

/**
 * Server Action to set the selected region
 * Stores region ID in session and persists in prefs cookie
 */
export async function setRegion(region: Region) {
  const session = await getSession();
  session.regionId = region.id;
  // S3 STS credentials are tied to the previous region's RGW endpoint;
  // invalidate them so the user re-auths against the new region.
  clearS3Credentials(session);
  await session.save();
  const preferenceIdentity = preferenceIdentityFromSession(session);
  if (preferenceIdentity) {
    await writePrefs({ regionId: region.id }, preferenceIdentity);
  }

  // Revalidate all pages to pick up new region
  revalidatePath("/", "layout");
}

/**
 * Server Action to set the selected project
 * Stores project ID in session and updates project-scoped token
 */
export async function setProject(project: Project) {
  const session = await getSession();

  // Get project-scoped token and store in session
  if (!session.keystone_unscoped_token) {
    return;
  }

  const context = await getProjectScopedTokenContext(
    session.keystone_unscoped_token,
    project.id,
  );

  if (!context) {
    console.error(
      "[keystone] failed to switch project: scoped token unavailable",
      {
        projectId: project.id,
        projectName: project.name,
      },
    );
    return;
  }

  session.projectId = project.id;
  session.keystoneProjectToken = context.value;
  session.keystoneProjectRoles = context.roles;
  clearS3Credentials(session);

  const servicePolicy = getServicePolicy();
  const catalog =
    session.regionId &&
    isSunriseServiceEnabled(
      servicePolicy,
      "object-storage",
      session.regionId,
    ) &&
    servicePolicy.objectStorageBackends.includes("s3") &&
    isObjectStorageBackendEnabled(servicePolicy, "s3", session.regionId)
      ? await getServiceCatalog(context.value)
      : null;
  const objectStorage =
    catalog && session.regionId
      ? resolveObjectStorageBackend(catalog, session.regionId, servicePolicy)
      : null;

  if (
    objectStorage?.backend === "s3" &&
    !getS3CredentialsForProject(session, project.id)
  ) {
    try {
      await refreshActiveProjectS3Credentials(session);
    } catch (err) {
      console.error("[keystone] failed to refresh S3 credentials for project", {
        projectId: project.id,
        projectName: project.name,
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  await session.save();
  const preferenceIdentity = preferenceIdentityFromSession(session);
  if (preferenceIdentity) {
    await writePrefs(
      { projectId: project.id, projectName: project.name },
      preferenceIdentity,
    );
  }

  // Revalidate all pages to pick up new project
  revalidatePath("/", "layout");
}
