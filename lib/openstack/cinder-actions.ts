"use server";

import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import type { Snapshot, Volume } from "@/types/openstack";
import { z } from "zod";

const CINDER_SERVICE = {
  serviceType: "volumev3",
  serviceName: "cinder",
} as const;
const NOVA_SERVICE = {
  serviceType: "compute",
  serviceName: "nova",
} as const;
const CINDER_API_VERSION = "volume 3.66";
const NOVA_API_VERSION = "compute 2.79";

const resourceIdSchema = z.string().trim().min(1).max(255);
const optionalText = z.string().trim().max(255).optional();
const volumeCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).optional(),
  size: z.coerce.number().int().min(1).max(1_048_576),
  availabilityZone: optionalText,
  volumeType: optionalText,
});
const volumeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).default(""),
});
const snapshotCreateSchema = z.object({
  volumeId: resourceIdSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(255).optional(),
});
const volumeAttachSchema = z.object({
  volumeId: resourceIdSchema,
  serverId: resourceIdSchema,
  deleteOnTermination: z.boolean().default(false),
  tag: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9_.-]*$/, "Use letters, numbers, periods, underscores, or hyphens.")
    .optional(),
});
const volumeDetachSchema = z.object({
  volumeId: resourceIdSchema,
  serverId: resourceIdSchema,
});

export type CreateVolumeInput = z.input<typeof volumeCreateSchema>;
export type UpdateVolumeInput = z.input<typeof volumeUpdateSchema>;
export type CreateSnapshotInput = z.input<typeof snapshotCreateSchema>;
export type AttachVolumeInput = z.input<typeof volumeAttachSchema>;
export type DetachVolumeInput = z.input<typeof volumeDetachSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, scope: MutationScope) {
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

function parseResourceId(scope: MutationScope, id: string) {
  return parseInput(resourceIdSchema, id, scope);
}

export async function createVolumeAction(
  scope: MutationScope,
  input: CreateVolumeInput,
): Promise<MutationResult<Volume>> {
  const parsed = parseInput(volumeCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation<Volume>({
    actionLabel: "create a volume",
    scope,
    ...CINDER_SERVICE,
    path: "/volumes",
    method: "POST",
    apiVersion: CINDER_API_VERSION,
    body: {
      volume: {
        name: value.name,
        description: value.description || undefined,
        size: value.size,
        availability_zone: value.availabilityZone || undefined,
        volume_type: value.volumeType || undefined,
      },
    },
    invalidates: ["/compute", "/compute/volumes"],
    successMessage: `Volume ${value.name} is being created.`,
    transform: (payload) => {
      if (!payload || typeof payload !== "object" || !("volume" in payload)) {
        throw new Error("Cinder did not return the created volume");
      }
      return payload.volume as Volume;
    },
  });
}

export async function updateVolumeAction(
  scope: MutationScope,
  id: string,
  input: UpdateVolumeInput,
): Promise<MutationResult<Volume>> {
  const parsedId = parseResourceId(scope, id);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(volumeUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation<Volume>({
    actionLabel: "edit this volume",
    scope,
    ...CINDER_SERVICE,
    path: `/volumes/${encodeURIComponent(parsedId.value)}`,
    method: "PUT",
    apiVersion: CINDER_API_VERSION,
    body: { volume: parsed.value },
    invalidates: [
      "/compute/volumes",
      `/compute/volumes/${parsedId.value}`,
    ],
    successMessage: "Volume details updated.",
    transform: (payload) => {
      if (!payload || typeof payload !== "object" || !("volume" in payload)) {
        throw new Error("Cinder did not return the updated volume");
      }
      return payload.volume as Volume;
    },
  });
}

export async function deleteVolumeAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = parseResourceId(scope, id);
  if (!parsedId.ok) return parsedId.result;

  return executeOpenStackMutation({
    actionLabel: "delete this volume",
    scope,
    ...CINDER_SERVICE,
    path: `/volumes/${encodeURIComponent(parsedId.value)}`,
    method: "DELETE",
    apiVersion: CINDER_API_VERSION,
    invalidates: [
      "/compute",
      "/compute/volumes",
      `/compute/volumes/${parsedId.value}`,
    ],
    successMessage: "Volume deletion requested.",
  });
}

export async function createSnapshotAction(
  scope: MutationScope,
  input: CreateSnapshotInput,
): Promise<MutationResult<Snapshot>> {
  const parsed = parseInput(snapshotCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation<Snapshot>({
    actionLabel: "create a volume snapshot",
    scope,
    ...CINDER_SERVICE,
    path: "/snapshots",
    method: "POST",
    apiVersion: CINDER_API_VERSION,
    body: {
      snapshot: {
        volume_id: value.volumeId,
        name: value.name,
        description: value.description || undefined,
      },
    },
    invalidates: ["/compute", "/compute/snapshots", "/compute/volumes"],
    successMessage: `Snapshot ${value.name} is being created.`,
    transform: (payload) => {
      if (!payload || typeof payload !== "object" || !("snapshot" in payload)) {
        throw new Error("Cinder did not return the created snapshot");
      }
      return payload.snapshot as Snapshot;
    },
  });
}

export async function deleteSnapshotAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = parseResourceId(scope, id);
  if (!parsedId.ok) return parsedId.result;

  return executeOpenStackMutation({
    actionLabel: "delete this snapshot",
    scope,
    ...CINDER_SERVICE,
    path: `/snapshots/${encodeURIComponent(parsedId.value)}`,
    method: "DELETE",
    apiVersion: CINDER_API_VERSION,
    invalidates: [
      "/compute",
      "/compute/snapshots",
      `/compute/snapshots/${parsedId.value}`,
    ],
    successMessage: "Snapshot deletion requested.",
  });
}

export async function attachVolumeAction(
  scope: MutationScope,
  input: AttachVolumeInput,
): Promise<MutationResult<null>> {
  const parsed = parseInput(volumeAttachSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation({
    actionLabel: "attach this volume",
    scope,
    ...NOVA_SERVICE,
    path: `/servers/${encodeURIComponent(value.serverId)}/os-volume_attachments`,
    method: "POST",
    apiVersion: NOVA_API_VERSION,
    body: {
      volumeAttachment: {
        volumeId: value.volumeId,
        delete_on_termination: value.deleteOnTermination,
        tag: value.tag || undefined,
      },
    },
    invalidates: [
      "/compute/instances",
      `/compute/instances/${value.serverId}`,
      "/compute/volumes",
      `/compute/volumes/${value.volumeId}`,
    ],
    successMessage: "Volume attachment requested.",
  });
}

export async function detachVolumeAction(
  scope: MutationScope,
  input: DetachVolumeInput,
): Promise<MutationResult<null>> {
  const parsed = parseInput(volumeDetachSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation({
    actionLabel: "detach this volume",
    scope,
    ...NOVA_SERVICE,
    path: `/servers/${encodeURIComponent(value.serverId)}/os-volume_attachments/${encodeURIComponent(value.volumeId)}`,
    method: "DELETE",
    apiVersion: NOVA_API_VERSION,
    invalidates: [
      "/compute/instances",
      `/compute/instances/${value.serverId}`,
      "/compute/volumes",
      `/compute/volumes/${value.volumeId}`,
    ],
    successMessage: "Volume detachment requested.",
  });
}
