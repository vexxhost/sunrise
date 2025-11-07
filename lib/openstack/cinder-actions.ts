'use server';

import { openstack } from '@/lib/openstack/actions';
import { getSession } from '@/lib/session';
import type {
  Backup,
  CreateBackupRequest,
  CreateSnapshotRequest,
  CreateVolumeRequest,
  DetachVolumeRequest,
  ListSnapshotsOptions,
  ListBackupsOptions,
  ListVolumesOptions,
  RestoreBackupRequest,
  Snapshot,
  Volume,
  VolumeType,
  AttachVolumeRequest,
  ExtendVolumeRequest,
  RetypeVolumeRequest,
} from '@/types/openstack';

const SERVICE_TYPE = 'volumev3';
const SERVICE_NAME = 'cinder';

function buildSearchParams(params: Record<string, unknown> = {}): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}

async function resolveRegionId(regionId?: string): Promise<string> {
  if (regionId) {
    return regionId;
  }

  const session = await getSession();

  if (!session.regionId) {
    throw new Error('No region available for Cinder request');
  }

  return session.regionId;
}

function ensureResponse<T>(payload: T | null, errorMessage: string): T {
  if (!payload) {
    throw new Error(errorMessage);
  }

  return payload;
}

export async function listVolumesAction(
  options: ListVolumesOptions = {},
  regionId?: string,
): Promise<Volume[]> {
  const resolvedRegion = await resolveRegionId(regionId);
  const queryString = buildSearchParams(options);

  const data = await openstack<{ volumes: Volume[] }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: queryString ? `/volumes/detail?${queryString}` : '/volumes/detail',
  });

  return ensureResponse(data, 'Unable to fetch volumes').volumes;
}

export async function getVolumeAction(id: string, regionId?: string): Promise<Volume> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ volume: Volume }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}`,
  });

  return ensureResponse(data, `Volume ${id} not found`).volume;
}

export async function listVolumeTypesAction(regionId?: string): Promise<VolumeType[]> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ volume_types: VolumeType[] }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/types',
  });

  return ensureResponse(data, 'Unable to fetch volume types').volume_types;
}

export async function createVolumeAction(
  payload: CreateVolumeRequest,
  regionId?: string,
): Promise<Volume> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ volume: Volume }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/volumes',
    method: 'POST',
    body: { volume: payload },
  });

  return ensureResponse(data, 'Failed to create volume').volume;
}

export async function deleteVolumeAction(
  id: string,
  { force = false }: { force?: boolean } = {},
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  if (force) {
    await openstack({
      regionId: resolvedRegion,
      serviceType: SERVICE_TYPE,
      serviceName: SERVICE_NAME,
      path: `/volumes/${id}/action`,
      method: 'POST',
      body: { 'os-force_delete': null },
    });
    return;
  }

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}`,
    method: 'DELETE',
  });
}

export async function extendVolumeAction(
  id: string,
  payload: ExtendVolumeRequest,
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}/action`,
    method: 'POST',
    body: { 'os-extend': payload },
  });
}

export async function retypeVolumeAction(
  id: string,
  payload: RetypeVolumeRequest,
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}/action`,
    method: 'POST',
    body: { 'os-retype': payload },
  });
}

export async function setVolumeReadonlyAction(
  id: string,
  readonly: boolean,
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}/action`,
    method: 'POST',
    body: { 'os-set_readonly': { readonly } },
  });
}

export async function attachVolumeAction(
  id: string,
  payload: AttachVolumeRequest,
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}/action`,
    method: 'POST',
    body: { 'os-attach': payload },
  });
}

export async function detachVolumeAction(
  id: string,
  payload: DetachVolumeRequest,
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/volumes/${id}/action`,
    method: 'POST',
    body: { 'os-detach': payload },
  });
}

export async function listSnapshotsAction(
  options: Partial<ListSnapshotsOptions> = {},
  regionId?: string,
): Promise<Snapshot[]> {
  const resolvedRegion = await resolveRegionId(regionId);
  const queryString = buildSearchParams(options);

  const data = await openstack<{ snapshots: Snapshot[] }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: queryString ? `/snapshots/detail?${queryString}` : '/snapshots/detail',
  });

  return ensureResponse(data, 'Unable to fetch snapshots').snapshots;
}

export async function getSnapshotAction(id: string, regionId?: string): Promise<Snapshot> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ snapshot: Snapshot }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/snapshots/${id}`,
  });

  return ensureResponse(data, `Snapshot ${id} not found`).snapshot;
}

export async function createSnapshotAction(
  payload: CreateSnapshotRequest,
  regionId?: string,
): Promise<Snapshot> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ snapshot: Snapshot }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/snapshots',
    method: 'POST',
    body: { snapshot: payload },
  });

  return ensureResponse(data, 'Failed to create snapshot').snapshot;
}

export async function deleteSnapshotAction(id: string, regionId?: string): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/snapshots/${id}`,
    method: 'DELETE',
  });
}

export async function listBackupsAction(
  options: ListBackupsOptions = {},
  regionId?: string,
): Promise<Backup[]> {
  const resolvedRegion = await resolveRegionId(regionId);
  const queryString = buildSearchParams(options);

  const data = await openstack<{ backups: Backup[] }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: queryString ? `/backups/detail?${queryString}` : '/backups/detail',
  });

  return ensureResponse(data, 'Unable to fetch backups').backups;
}

export async function getBackupAction(id: string, regionId?: string): Promise<Backup> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ backup: Backup }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/backups/${id}`,
  });

  return ensureResponse(data, `Backup ${id} not found`).backup;
}

export async function createBackupAction(
  payload: CreateBackupRequest,
  regionId?: string,
): Promise<Backup> {
  const resolvedRegion = await resolveRegionId(regionId);

  const data = await openstack<{ backup: Backup }>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: '/backups',
    method: 'POST',
    body: { backup: payload },
  });

  return ensureResponse(data, 'Failed to create backup').backup;
}

export async function deleteBackupAction(id: string, regionId?: string): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/backups/${id}`,
    method: 'DELETE',
  });
}

export async function restoreBackupAction(
  id: string,
  payload: RestoreBackupRequest = {},
  regionId?: string,
): Promise<void> {
  const resolvedRegion = await resolveRegionId(regionId);

  await openstack({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/backups/${id}/restore`,
    method: 'POST',
    body: { restore: payload },
  });
}

