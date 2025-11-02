/**
 * Client-side Cinder (Block Storage) API functions
 */

import { api } from './api';
import type { Volume, Snapshot, ListVolumesOptions, ListSnapshotsOptions } from '../cinder';

export async function listVolumes(options?: ListVolumesOptions): Promise<Volume[]> {
  const query = api.query(options);
  const data = await api.fetch<{ volumes: Volume[] }>('cinder', `volumes/detail${query}`);
  return data.volumes;
}

export async function getVolume(id: string): Promise<Volume> {
  const data = await api.fetch<{ volume: Volume }>('cinder', `volumes/${id}`);
  return data.volume;
}

export async function getVolumes(volumeIDs: string[]): Promise<Volume[]> {
  const volumeList = await Promise.all(
    volumeIDs.map(id => getVolume(id))
  );
  return volumeList;
}

export async function listSnapshots(options?: ListSnapshotsOptions): Promise<Snapshot[]> {
  const query = api.query(options);
  const data = await api.fetch<{ snapshots: Snapshot[] }>('cinder', `snapshots/detail${query}`);
  return data.snapshots;
}

export async function getSnapshot(id: string): Promise<Snapshot> {
  const data = await api.fetch<{ snapshot: Snapshot }>('cinder', `snapshots/${id}`);
  return data.snapshot;
}
