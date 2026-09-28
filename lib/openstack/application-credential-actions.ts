"use server";

import {
  parseCreateApplicationCredentialInput,
  parseCreatedApplicationCredential,
  type CreateApplicationCredentialInput,
} from "@/lib/openstack/application-credential-schema";
import { getApplicationCredentialAction } from "@/lib/openstack/application-credentials";
import { identityApiUrl } from "@/lib/openstack/identity-api";
import { getUserInfo } from "@/lib/openstack/keystone-actions";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { normalizeProjectId } from "@/lib/session";
import type { CreatedApplicationCredential } from "@/types/openstack";

const SERVICE_TYPE = "identity";
const SERVICE_NAME = "keystone";

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    {
      code: "validation-failed",
      message,
      retryable: false,
    },
    scope,
  );
}

async function currentUserId(scope: MutationScope) {
  const identity = await getUserInfo();
  if (!identity?.id) return null;

  if (
    identity.project?.id &&
    normalizeProjectId(identity.project.id) !== normalizeProjectId(scope.projectId)
  ) {
    return null;
  }
  return identity;
}

export async function createApplicationCredentialAction(
  scope: MutationScope,
  input: CreateApplicationCredentialInput,
): Promise<MutationResult<CreatedApplicationCredential>> {
  const parsed = parseCreateApplicationCredentialInput(input);
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the values and try again.",
    );
  }

  if (
    parsed.data.expiresAt &&
    Date.parse(parsed.data.expiresAt) <= Date.now()
  ) {
    return validationFailure(scope, "Expiration must be in the future.");
  }

  const identity = await currentUserId(scope);
  if (!identity) {
    return validationFailure(
      scope,
      "The active Keystone user and project could not be verified.",
    );
  }

  const allowedRoleIds = new Set(identity.roles.map(({ id }) => id));
  if (parsed.data.roleIds?.some((id) => !allowedRoleIds.has(id))) {
    return validationFailure(
      scope,
      "One or more selected roles are no longer assigned in this project.",
    );
  }

  return executeOpenStackMutation<CreatedApplicationCredential>({
    actionLabel: "create an application credential",
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    endpointOverride: identityApiUrl(),
    requireRegion: false,
    path: `/users/${encodeURIComponent(identity.id)}/application_credentials`,
    method: "POST",
    body: {
      application_credential: {
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        secret: parsed.data.secret || undefined,
        expires_at: parsed.data.expiresAt || undefined,
        roles: parsed.data.roleIds?.map((id) => ({ id })),
        access_rules: parsed.data.accessRules.length
          ? parsed.data.accessRules
          : undefined,
        unrestricted: parsed.data.unrestricted,
      },
    },
    invalidates: ["/identity", "/identity/application-credentials"],
    successMessage: `Application credential ${parsed.data.name} was created.`,
    transform: parseCreatedApplicationCredential,
  });
}

export async function deleteApplicationCredentialAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const credentialId = id.trim();
  if (!credentialId || credentialId.length > 255) {
    return validationFailure(scope, "Select a valid application credential.");
  }

  const identity = await currentUserId(scope);
  if (!identity) {
    return validationFailure(
      scope,
      "The active Keystone user and project could not be verified.",
    );
  }

  const credential = await getApplicationCredentialAction(credentialId);
  if (!credential) {
    return validationFailure(
      scope,
      "The application credential is not available in the active project.",
    );
  }

  return executeOpenStackMutation({
    actionLabel: "delete this application credential",
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    endpointOverride: identityApiUrl(),
    requireRegion: false,
    path: `/users/${encodeURIComponent(identity.id)}/application_credentials/${encodeURIComponent(credentialId)}`,
    method: "DELETE",
    invalidates: ["/identity", "/identity/application-credentials"],
    successMessage: "Application credential deleted.",
  });
}
