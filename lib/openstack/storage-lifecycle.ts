import type { Snapshot, Volume } from "@/types/openstack";

const VOLUME_TRANSITION_STATUSES = new Set([
  "attaching",
  "backing-up",
  "creating",
  "deleting",
  "detaching",
  "downloading",
  "extending",
  "maintenance",
  "reserved",
  "restoring-backup",
  "retyping",
  "uploading",
]);

const VOLUME_DELETE_STATUSES = new Set([
  "available",
  "error",
  "error_extending",
  "error_managing",
  "error_restoring",
]);

const SNAPSHOT_TRANSITION_STATUSES = new Set([
  "creating",
  "deleting",
  "restoring",
]);

export function isVolumeTransitioning(volume: Volume) {
  return VOLUME_TRANSITION_STATUSES.has(volume.status.toLowerCase());
}

export function canEditVolume(volume: Volume) {
  return !isVolumeTransitioning(volume);
}

export function canAttachVolume(volume: Volume) {
  return (
    volume.status === "available" ||
    (volume.multiattach && volume.status === "in-use")
  );
}

export function canDetachVolume(volume: Volume) {
  return volume.attachments.length > 0 && volume.status === "in-use";
}

export function canSnapshotVolume(volume: Volume) {
  return volume.status === "available" || volume.status === "in-use";
}

export function canDeleteVolume(volume: Volume) {
  return (
    VOLUME_DELETE_STATUSES.has(volume.status.toLowerCase()) &&
    volume.attachments.length === 0 &&
    !volume.group_id
  );
}

export function isSnapshotTransitioning(snapshot: Snapshot) {
  return SNAPSHOT_TRANSITION_STATUSES.has(snapshot.status.toLowerCase());
}

export function canDeleteSnapshot(snapshot: Snapshot) {
  return snapshot.status === "available" || snapshot.status === "error";
}

export function mergeVolumeUpdates(
  current: Volume[],
  updates: ReadonlyMap<string, Volume>,
) {
  let changed = false;
  const next = current.map((volume) => {
    const updated = updates.get(volume.id);
    changed = changed || Boolean(updated && updated !== volume);
    return updated ?? volume;
  });
  return changed ? next : current;
}

export function mergeSnapshotUpdates(
  current: Snapshot[],
  updates: ReadonlyMap<string, Snapshot>,
) {
  let changed = false;
  const next = current.map((snapshot) => {
    const updated = updates.get(snapshot.id);
    changed = changed || Boolean(updated && updated !== snapshot);
    return updated ?? snapshot;
  });
  return changed ? next : current;
}
