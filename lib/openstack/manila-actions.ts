"use server";

import { z } from "zod";

import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import { getShare, MANILA_API_VERSION } from "@/lib/openstack/manila-server";
import type { ManilaShare, ManilaShareAccessRule } from "@/types/openstack";

const MANILA_SERVICE = {
  serviceType: "sharev2",
  serviceName: "manilav2",
} as const;
const MANILA_HEADERS = {
  "X-OpenStack-Manila-API-Version": MANILA_API_VERSION,
} as const;

const resourceIdSchema = z.string().trim().min(1).max(255);
const optionalText = z.string().trim().max(255).optional();
const metadataSchema = z
  .record(z.string().trim().min(1).max(255), z.string().max(255))
  .refine((value) => Object.keys(value).length <= 64, {
    message: "Use no more than 64 metadata entries.",
  })
  .default({});
const createShareSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: optionalText,
  size: z.coerce.number().int().min(1).max(1_048_576),
  protocol: z.enum(["NFS", "CIFS", "GLUSTERFS", "HDFS", "CEPHFS", "MAPRFS"]),
  shareType: optionalText,
  shareNetworkId: optionalText,
  availabilityZone: optionalText,
  isPublic: z.boolean().default(false),
  metadata: metadataSchema,
});
const updateShareSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).default(""),
  isPublic: z.boolean().default(false),
});
const resizeShareSchema = z.object({
  newSize: z.coerce.number().int().min(1).max(1_048_576),
});
const grantAccessSchema = z.object({
  accessType: z.enum(["ip", "cert", "user"]),
  accessTo: z.string().trim().min(1).max(255),
  accessLevel: z.enum(["rw", "ro"]),
});

export type CreateShareInput = z.input<typeof createShareSchema>;
export type UpdateShareInput = z.input<typeof updateShareSchema>;
export type ResizeShareInput = z.input<typeof resizeShareSchema>;
export type GrantShareAccessInput = z.input<typeof grantAccessSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  scope: MutationScope,
) {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ({ ok: true, value: parsed.data } as const)
    : ({
        ok: false,
        result: validationFailure(
          scope,
          parsed.error.issues[0]?.message ?? "Review the values and try again.",
        ),
      } as const);
}

async function activeMutationScope(scope: MutationScope) {
  return guardMutationContext(scope);
}

function projectPath(projectId: string, suffix: string) {
  return `/${encodeURIComponent(projectId)}/${suffix}`;
}

function shareFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("share" in payload)) {
    throw new Error("Manila did not return the share");
  }
  return (payload as { share: ManilaShare }).share;
}

export async function createShareAction(
  scope: MutationScope,
  input: CreateShareInput,
): Promise<MutationResult<ManilaShare>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsed = parseInput(createShareSchema, input, guarded.context.scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation<ManilaShare>({
    actionLabel: "create a share",
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(guarded.context.scope.projectId, "shares"),
    method: "POST",
    headers: MANILA_HEADERS,
    body: {
      share: {
        name: value.name,
        description: value.description || undefined,
        size: value.size,
        share_proto: value.protocol,
        share_type: value.shareType || undefined,
        share_network_id: value.shareNetworkId || undefined,
        availability_zone: value.availabilityZone || undefined,
        is_public: value.isPublic,
        metadata: value.metadata,
      },
    },
    invalidates: ["/shared-file-systems", "/shared-file-systems/shares"],
    successMessage: `Share ${value.name} is being created.`,
    transform: shareFromPayload,
  });
}

export async function updateShareAction(
  scope: MutationScope,
  shareId: string,
  input: UpdateShareInput,
): Promise<MutationResult<ManilaShare>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsedId = parseInput(resourceIdSchema, shareId, guarded.context.scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(updateShareSchema, input, guarded.context.scope);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation<ManilaShare>({
    actionLabel: "edit this share",
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(
      guarded.context.scope.projectId,
      `shares/${encodeURIComponent(parsedId.value)}`,
    ),
    method: "PUT",
    headers: MANILA_HEADERS,
    body: {
      share: {
        display_name: parsed.value.name,
        display_description: parsed.value.description,
        is_public: parsed.value.isPublic,
      },
    },
    invalidates: [
      "/shared-file-systems",
      "/shared-file-systems/shares",
      `/shared-file-systems/shares/${parsedId.value}`,
    ],
    successMessage: "Share details updated.",
    transform: shareFromPayload,
  });
}

export async function resizeShareAction(
  scope: MutationScope,
  shareId: string,
  input: ResizeShareInput,
): Promise<MutationResult<null>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsedId = parseInput(resourceIdSchema, shareId, guarded.context.scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(resizeShareSchema, input, guarded.context.scope);
  if (!parsed.ok) return parsed.result;

  const share = await getShare(parsedId.value);
  if (parsed.value.newSize === share.size) {
    return validationFailure(
      guarded.context.scope,
      "Choose a size different from the current share size.",
    );
  }
  const operation = parsed.value.newSize > share.size ? "extend" : "shrink";

  return executeOpenStackMutation({
    actionLabel: `${operation} this share`,
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(
      guarded.context.scope.projectId,
      `shares/${encodeURIComponent(parsedId.value)}/action`,
    ),
    method: "POST",
    headers: MANILA_HEADERS,
    body: { [operation]: { new_size: parsed.value.newSize } },
    invalidates: [
      "/shared-file-systems",
      "/shared-file-systems/shares",
      `/shared-file-systems/shares/${parsedId.value}`,
    ],
    successMessage: `Share resize to ${parsed.value.newSize} GiB requested.`,
  });
}

export async function deleteShareAction(
  scope: MutationScope,
  shareId: string,
): Promise<MutationResult<null>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsedId = parseInput(resourceIdSchema, shareId, guarded.context.scope);
  if (!parsedId.ok) return parsedId.result;

  return executeOpenStackMutation({
    actionLabel: "delete this share",
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(
      guarded.context.scope.projectId,
      `shares/${encodeURIComponent(parsedId.value)}`,
    ),
    method: "DELETE",
    headers: MANILA_HEADERS,
    removedResource: { kind: "share", id: parsedId.value },
    invalidates: [
      "/shared-file-systems",
      "/shared-file-systems/shares",
      `/shared-file-systems/shares/${parsedId.value}`,
    ],
    successMessage: "Share deletion requested.",
  });
}

export async function grantShareAccessAction(
  scope: MutationScope,
  shareId: string,
  input: GrantShareAccessInput,
): Promise<MutationResult<ManilaShareAccessRule>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsedId = parseInput(resourceIdSchema, shareId, guarded.context.scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(grantAccessSchema, input, guarded.context.scope);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation<ManilaShareAccessRule>({
    actionLabel: "grant access to this share",
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(
      guarded.context.scope.projectId,
      `shares/${encodeURIComponent(parsedId.value)}/action`,
    ),
    method: "POST",
    headers: MANILA_HEADERS,
    body: {
      allow_access: {
        access_type: parsed.value.accessType,
        access_to: parsed.value.accessTo,
        access_level: parsed.value.accessLevel,
      },
    },
    invalidates: [`/shared-file-systems/shares/${parsedId.value}`],
    successMessage: "Share access is being granted.",
    transform: (payload) => {
      if (!payload || typeof payload !== "object" || !("access" in payload)) {
        throw new Error("Manila did not return the access rule");
      }
      return (payload as { access: ManilaShareAccessRule }).access;
    },
  });
}

export async function revokeShareAccessAction(
  scope: MutationScope,
  shareId: string,
  accessId: string,
): Promise<MutationResult<null>> {
  const guarded = await activeMutationScope(scope);
  if (!guarded.ok) return guarded.result;
  const parsedShareId = parseInput(
    resourceIdSchema,
    shareId,
    guarded.context.scope,
  );
  if (!parsedShareId.ok) return parsedShareId.result;
  const parsedAccessId = parseInput(
    resourceIdSchema,
    accessId,
    guarded.context.scope,
  );
  if (!parsedAccessId.ok) return parsedAccessId.result;

  return executeOpenStackMutation({
    actionLabel: "revoke access to this share",
    scope: guarded.context.scope,
    ...MANILA_SERVICE,
    path: projectPath(
      guarded.context.scope.projectId,
      `shares/${encodeURIComponent(parsedShareId.value)}/action`,
    ),
    method: "POST",
    headers: MANILA_HEADERS,
    body: { deny_access: { access_id: parsedAccessId.value } },
    invalidates: [`/shared-file-systems/shares/${parsedShareId.value}`],
    successMessage: "Share access is being revoked.",
  });
}
