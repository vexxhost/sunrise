"use server";

import { redirect } from "next/navigation";
import { getServiceCatalog } from "@/lib/openstack/catalog";
import { openstack } from "@/lib/openstack/actions";
import {
  parseApplicationCredential,
  parseApplicationCredentialList,
} from "@/lib/openstack/application-credential-schema";
import { getUserInfo } from "@/lib/openstack/keystone-actions";
import { identityApiUrl } from "@/lib/openstack/identity-api";
import { isOpenStackNotFoundError } from "@/lib/openstack/request";
import { getSession, normalizeProjectId } from "@/lib/session";
import type {
  ApplicationCredential,
  KeystoneRole,
} from "@/types/openstack";

const SERVICE_TYPE = "identity";
const SERVICE_NAME = "keystone";

export type ApplicationCredentialPageData = {
  credentials: ApplicationCredential[];
  observedAt: number;
  roles: KeystoneRole[];
  serviceTypes: string[];
  userId: string;
  authUrl: string;
};

async function currentIdentityContext() {
  const session = await getSession();
  if (!session.keystoneProjectToken) redirect("/auth/refresh");

  const identity = await getUserInfo();
  if (!identity?.id || !session.projectId) {
    throw new Error("The current Keystone user or project could not be resolved.");
  }

  return {
    projectId: session.projectId,
    regionId: session.regionId ?? "",
    token: session.keystoneProjectToken,
    userId: identity.id,
    roles: identity.roles,
  };
}

export async function listApplicationCredentialsAction(): Promise<ApplicationCredentialPageData> {
  const context = await currentIdentityContext();
  const [response, catalog] = await Promise.all([
    openstack({
      regionId: context.regionId,
      serviceType: SERVICE_TYPE,
      serviceName: SERVICE_NAME,
      endpointOverride: identityApiUrl(),
      path: `/users/${encodeURIComponent(context.userId)}/application_credentials`,
      errorMode: "throw",
    }),
    getServiceCatalog(context.token),
  ]);

  const credentials = parseApplicationCredentialList(response).filter(
    (credential) =>
      normalizeProjectId(credential.project_id) ===
      normalizeProjectId(context.projectId),
  );
  const serviceTypes = Array.from(
    new Set((catalog ?? []).map(({ type }) => type).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));

  return {
    credentials,
    observedAt: Date.now(),
    roles: context.roles,
    serviceTypes,
    userId: context.userId,
    authUrl: identityApiUrl(),
  };
}

export async function getApplicationCredentialAction(
  id: string,
): Promise<ApplicationCredential | null> {
  const credentialId = id.trim();
  if (!credentialId) return null;

  const context = await currentIdentityContext();
  let response: unknown;
  try {
    response = await openstack({
      regionId: context.regionId,
      serviceType: SERVICE_TYPE,
      serviceName: SERVICE_NAME,
      endpointOverride: identityApiUrl(),
      path: `/users/${encodeURIComponent(context.userId)}/application_credentials/${encodeURIComponent(credentialId)}`,
      errorMode: "throw",
    });
  } catch (error) {
    if (isOpenStackNotFoundError(error)) return null;
    throw error;
  }

  const credential = parseApplicationCredential(response);
  return normalizeProjectId(credential.project_id) ===
    normalizeProjectId(context.projectId)
    ? credential
    : null;
}
