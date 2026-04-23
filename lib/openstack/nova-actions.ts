'use server';

import { openstack } from '@/lib/openstack/actions';
import { getSession } from '@/lib/session';
import type {
  CreateServerImageRequest,
  CreateServerRequest,
  LiveMigrateServerRequest,
  MigrateServerRequest,
  RebuildServerRequest,
  RescueServerRequest,
  ResizeServerRequest,
  Server,
  ServerConsole,
  ServerResponse,
  VncConsoleType,
} from '@/types/openstack';

const SERVICE_TYPE = 'compute';
const SERVICE_NAME = 'nova';
const API_VERSION = 'compute 2.79';

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
  payload: CreateServerRequest,
  regionId?: string,
): Promise<Server> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<ServerResponse>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/servers',
    method: 'POST',
    apiVersion: API_VERSION,
    body: { server: payload },
  });

  return ensureResponse(data, 'Failed to launch instance').server;
}

export async function deleteServerAction(
  id: string,
  { force = false }: { force?: boolean } = {},
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  if (force) {
    await performInstanceAction(id, { forceDelete: null }, resolvedRegion);
    return;
  }

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${id}`,
    method: 'DELETE',
    apiVersion: API_VERSION,
  });
}

export async function rebootServerAction(
  id: string,
  type: 'SOFT' | 'HARD',
  regionId?: string,
): Promise<void> {
  await performInstanceAction(id, { reboot: { type } }, regionId);
}

export async function startServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { 'os-start': null }, regionId);
}

export async function stopServerAction(id: string, regionId?: string): Promise<void> {
  await performInstanceAction(id, { 'os-stop': null }, regionId);
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
  id: string,
  payload: RebuildServerRequest,
  regionId?: string,
): Promise<Server> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<ServerResponse>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/servers/${id}/action`,
    method: 'POST',
    apiVersion: API_VERSION,
    body: { rebuild: payload },
  });

  return ensureResponse(data, `Failed to rebuild instance ${id}`).server;
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
