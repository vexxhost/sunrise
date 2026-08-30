'use server';

import { openstack } from '@/lib/openstack/actions';
import { executeOpenStackMutation } from '@/lib/openstack/mutations';
import { getSession } from '@/lib/session';
import { mutationFailure, type MutationResult, type MutationScope } from '@/lib/mutations';
import { z } from 'zod';
import type {
  CreateServerImageRequest,
  Keypair,
  LiveMigrateServerRequest,
  MigrateServerRequest,
  RescueServerRequest,
  ResizeServerRequest,
  Server,
  ServerConsole,
  VncConsoleType,
} from '@/types/openstack';

const SERVICE_TYPE = 'compute';
const SERVICE_NAME = 'nova';
const API_VERSION = 'compute 2.79';

const resourceIdSchema = z.string().trim().min(1).max(255);
const serverNameSchema = z.string().trim().min(1).max(255);
const metadataSchema = z
  .record(z.string().trim().min(1).max(255), z.string().max(255))
  .refine((value) => Object.keys(value).length <= 128, {
    message: 'Metadata cannot contain more than 128 entries.',
  });

const launchServerSchema = z.object({
  name: serverNameSchema,
  imageRef: resourceIdSchema,
  flavorRef: resourceIdSchema,
  keyName: z.string().trim().max(255).optional(),
  networkIds: z.array(resourceIdSchema).max(32).default([]),
  securityGroupNames: z.array(z.string().trim().min(1).max(255)).max(32).default([]),
  availabilityZone: z.string().trim().max(255).optional(),
  metadata: metadataSchema.default({}),
  userData: z.string().max(65_535).optional(),
  configDrive: z.boolean().default(false),
});

const rebuildServerSchema = z.object({
  imageRef: resourceIdSchema,
  keyName: z.string().trim().max(255).nullable().optional(),
  metadata: metadataSchema.optional(),
  preserveEphemeral: z.boolean().default(false),
  userData: z.string().max(65_535).nullable().optional(),
});

const keypairSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, periods, underscores, or hyphens.'),
  publicKey: z.string().trim().min(16).max(16_384).optional(),
});

export type LaunchServerInput = z.input<typeof launchServerSchema>;
export type RebuildServerInput = z.input<typeof rebuildServerSchema>;
export type KeypairInput = z.input<typeof keypairSchema>;
export type ServerLifecycleAction = 'start' | 'stop' | 'soft-reboot' | 'hard-reboot';

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    {
      code: 'validation-failed',
      message,
      retryable: false,
    },
    scope,
  );
}

function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  scope: MutationScope,
): { ok: true; value: T } | { ok: false; result: ReturnType<typeof validationFailure> } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      result: validationFailure(
        scope,
        parsed.error.issues[0]?.message ?? 'Review the values and try again.',
      ),
    };
  }

  return { ok: true, value: parsed.data };
}

function encodeUserData(value?: string | null) {
  return value ? Buffer.from(value, 'utf8').toString('base64') : value;
}

async function resolveRegionId(regionId?: string): Promise<string> {
  if (regionId) {
    return regionId;
  }

  const session = await getSession();

  if (!session.regionId) {
    throw new Error('No region available for Nova request');
  }

  return session.regionId;
}

function ensureResponse<T>(payload: T | null, errorMessage: string): T {
  if (!payload) {
    throw new Error(errorMessage);
  }

  return payload;
}

async function performInstanceAction(
  id: string,
  actionBody: Record<string, unknown>,
  regionId?: string,
  apiVersion: string = API_VERSION,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${id}/action`,
    method: 'POST',
    apiVersion,
    body: actionBody,
  });
}

export async function createServerAction(
  scope: MutationScope,
  input: LaunchServerInput,
): Promise<MutationResult<Server>> {
  const parsed = parseInput(launchServerSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  const payload = parsed.value;
  return executeOpenStackMutation<Server>({
    actionLabel: 'launch an instance',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/servers',
    method: 'POST',
    apiVersion: API_VERSION,
    body: {
      server: {
        name: payload.name,
        flavorRef: payload.flavorRef,
        imageRef: payload.imageRef,
        key_name: payload.keyName || undefined,
        networks: payload.networkIds.length
          ? payload.networkIds.map((uuid) => ({ uuid }))
          : undefined,
        security_groups: payload.securityGroupNames.length
          ? payload.securityGroupNames.map((name) => ({ name }))
          : undefined,
        availability_zone: payload.availabilityZone || undefined,
        metadata: Object.keys(payload.metadata).length ? payload.metadata : undefined,
        user_data: encodeUserData(payload.userData),
        config_drive: payload.configDrive || undefined,
      },
    },
    invalidates: ['/compute', '/compute/instances'],
    successMessage: `Instance ${payload.name} is being created.`,
    transform: (responsePayload) => {
      if (
        !responsePayload ||
        typeof responsePayload !== 'object' ||
        !('server' in responsePayload) ||
        !responsePayload.server ||
        typeof responsePayload.server !== 'object'
      ) {
        throw new Error('Nova did not return the created server');
      }

      return responsePayload.server as Server;
    },
  });
}

export async function deleteServerAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;

  return executeOpenStackMutation({
    actionLabel: 'delete this instance',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${encodeURIComponent(parsedId.value)}`,
    method: 'DELETE',
    apiVersion: API_VERSION,
    invalidates: [
      '/compute',
      '/compute/instances',
      `/compute/instances/${parsedId.value}`,
    ],
    successMessage: 'Instance deletion requested.',
  });
}

export async function runServerLifecycleAction(
  scope: MutationScope,
  id: string,
  action: ServerLifecycleAction,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;

  const actionConfig = {
    start: {
      actionLabel: 'start this instance',
      body: { 'os-start': null },
      message: 'Instance start requested.',
    },
    stop: {
      actionLabel: 'stop this instance',
      body: { 'os-stop': null },
      message: 'Instance stop requested.',
    },
    'soft-reboot': {
      actionLabel: 'reboot this instance',
      body: { reboot: { type: 'SOFT' } },
      message: 'Graceful reboot requested.',
    },
    'hard-reboot': {
      actionLabel: 'force reboot this instance',
      body: { reboot: { type: 'HARD' } },
      message: 'Forced reboot requested.',
    },
  } satisfies Record<
    ServerLifecycleAction,
    { actionLabel: string; body: Record<string, unknown>; message: string }
  >;
  const config = actionConfig[action];
  if (!config) return validationFailure(scope, 'Choose a supported instance action.');

  return executeOpenStackMutation({
    actionLabel: config.actionLabel,
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${encodeURIComponent(parsedId.value)}/action`,
    method: 'POST',
    apiVersion: API_VERSION,
    body: config.body,
    invalidates: [
      '/compute',
      '/compute/instances',
      `/compute/instances/${parsedId.value}`,
    ],
    successMessage: config.message,
  });
}

export async function pauseServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { pause: null }, regionId);
}

export async function unpauseServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { unpause: null }, regionId);
}

export async function suspendServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { suspend: null }, regionId);
}

export async function resumeServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { resume: null }, regionId);
}

export async function shelveServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { shelve: null }, regionId);
}

export async function shelveOffloadServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { shelveOffload: null }, regionId);
}

export async function unshelveServerAction(
  id: string,
  options: { availability_zone?: string } = {},
  regionId?: string,
): Promise<void> {
  const body = options.availability_zone
    ? { unshelve: { availability_zone: options.availability_zone } }
    : { unshelve: null };

  await performInstanceAction(id, body, regionId);
}

export async function lockServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { lock: null }, regionId);
}

export async function unlockServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { unlock: null }, regionId);
}

export async function rebuildServerAction(
  scope: MutationScope,
  id: string,
  input: RebuildServerInput,
): Promise<MutationResult<Server>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(rebuildServerSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const payload = parsed.value;

  return executeOpenStackMutation<Server>({
    actionLabel: 'rebuild this instance',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${encodeURIComponent(parsedId.value)}/action`,
    method: 'POST',
    apiVersion: API_VERSION,
    body: {
      rebuild: {
        imageRef: payload.imageRef,
        key_name: payload.keyName,
        metadata: payload.metadata,
        preserve_ephemeral: payload.preserveEphemeral,
        user_data: encodeUserData(payload.userData),
      },
    },
    invalidates: [
      '/compute',
      '/compute/instances',
      `/compute/instances/${parsedId.value}`,
    ],
    successMessage: 'Instance rebuild requested.',
    transform: (responsePayload) => {
      if (
        !responsePayload ||
        typeof responsePayload !== 'object' ||
        !('server' in responsePayload) ||
        !responsePayload.server ||
        typeof responsePayload.server !== 'object'
      ) {
        throw new Error('Nova did not return the rebuilt server');
      }
      return responsePayload.server as Server;
    },
  });
}

export async function replaceServerMetadataAction(
  scope: MutationScope,
  id: string,
  metadata: Record<string, string>,
): Promise<MutationResult<Record<string, string>>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsedMetadata = parseInput(metadataSchema, metadata, scope);
  if (!parsedMetadata.ok) return parsedMetadata.result;

  return executeOpenStackMutation<Record<string, string>>({
    actionLabel: 'update instance metadata',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${encodeURIComponent(parsedId.value)}/metadata`,
    method: 'PUT',
    apiVersion: API_VERSION,
    body: { metadata: parsedMetadata.value },
    invalidates: [
      '/compute/instances',
      `/compute/instances/${parsedId.value}`,
    ],
    successMessage: 'Instance metadata updated.',
    transform: (responsePayload) => {
      if (
        !responsePayload ||
        typeof responsePayload !== 'object' ||
        !('metadata' in responsePayload) ||
        !responsePayload.metadata ||
        typeof responsePayload.metadata !== 'object'
      ) {
        throw new Error('Nova did not return the updated metadata');
      }
      return responsePayload.metadata as Record<string, string>;
    },
  });
}

export async function createKeypairAction(
  scope: MutationScope,
  input: KeypairInput,
): Promise<MutationResult<Keypair>> {
  const parsed = parseInput(keypairSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation<Keypair>({
    actionLabel: parsed.value.publicKey ? 'import this key pair' : 'create this key pair',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/os-keypairs',
    method: 'POST',
    apiVersion: API_VERSION,
    body: {
      keypair: {
        name: parsed.value.name,
        type: 'ssh',
        public_key: parsed.value.publicKey,
      },
    },
    invalidates: ['/compute', '/compute/key-pairs'],
    successMessage: parsed.value.publicKey
      ? `Key pair ${parsed.value.name} imported.`
      : `Key pair ${parsed.value.name} created.`,
    transform: (responsePayload) => {
      if (
        !responsePayload ||
        typeof responsePayload !== 'object' ||
        !('keypair' in responsePayload) ||
        !responsePayload.keypair ||
        typeof responsePayload.keypair !== 'object'
      ) {
        throw new Error('Nova did not return the created key pair');
      }
      return responsePayload.keypair as Keypair;
    },
  });
}

export async function deleteKeypairAction(
  scope: MutationScope,
  name: string,
): Promise<MutationResult<null>> {
  const parsed = parseInput(keypairSchema.shape.name, name, scope);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation({
    actionLabel: 'delete this key pair',
    scope,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/os-keypairs/${encodeURIComponent(parsed.value)}`,
    method: 'DELETE',
    apiVersion: API_VERSION,
    invalidates: ['/compute', '/compute/key-pairs'],
    successMessage: `Key pair ${parsed.value} deleted.`,
  });
}

export async function resizeServerAction(
  id: string,
  payload: ResizeServerRequest,
  regionId?: string,
): Promise<void> {
  await performInstanceAction(id, { resize: payload }, regionId);
}

export async function confirmResizeServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { confirmResize: null }, regionId);
}

export async function revertResizeServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { revertResize: null }, regionId);
}

export async function migrateServerAction(
  id: string,
  payload: MigrateServerRequest = {},
  regionId?: string,
): Promise<void> {
  const body = Object.keys(payload).length > 0 ? { migrate: payload } : { migrate: null };
  await performInstanceAction(id, body, regionId);
}

export async function liveMigrateServerAction(
  id: string,
  payload: LiveMigrateServerRequest,
  regionId?: string,
): Promise<void> {
  await performInstanceAction(id, { 'os-migrateLive': payload }, regionId);
}

export async function rescueServerAction(
  id: string,
  payload: RescueServerRequest = {},
  regionId?: string,
): Promise<string | undefined> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ adminPass?: string }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${id}/action`,
    method: 'POST',
    apiVersion: API_VERSION,
    body: { rescue: payload },
  });

  return data?.adminPass;
}

export async function unrescueServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { unrescue: null }, regionId);
}

export async function createServerImageAction(
  id: string,
  payload: CreateServerImageRequest,
  regionId?: string,
): Promise<void> {
  await performInstanceAction(id, { createImage: payload }, regionId);
}

export async function getVncConsoleAction(
  id: string,
  type: VncConsoleType = 'novnc',
  regionId?: string,
): Promise<ServerConsole> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ console: ServerConsole }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${id}/action`,
    method: 'POST',
    apiVersion: API_VERSION,
    body: { 'os-getVNCConsole': { type } },
  });

  return ensureResponse(data, `Failed to fetch ${type} console for instance ${id}`).console;
}
