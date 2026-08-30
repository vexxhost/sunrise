import { describe, expect, it } from "vitest";

import {
  canAttachVolume,
  canDeleteSnapshot,
  canDeleteVolume,
  canDetachVolume,
  canSnapshotVolume,
  isSnapshotTransitioning,
  isVolumeTransitioning,
  mergeSnapshotUpdates,
  mergeVolumeUpdates,
} from "@/lib/openstack/storage-lifecycle";
import {
  formatSnapshotStatus,
  formatVolumeStatus,
} from "@/lib/openstack/storage-status";
import type { Snapshot, Volume } from "@/types/openstack";

function volume(status: string, overrides: Partial<Volume> = {}) {
  return {
    id: "volume-a",
    status,
    attachments: [],
    multiattach: false,
    ...overrides,
  } as Volume;
}

function snapshot(status: string) {
  return { id: "snapshot-a", status } as Snapshot;
}

describe("Cinder lifecycle availability", () => {
  it("gates attachment, detachment, snapshots, and deletion by live state", () => {
    expect(canAttachVolume(volume("available"))).toBe(true);
    expect(canAttachVolume(volume("in-use"))).toBe(false);
    expect(canAttachVolume(volume("in-use", { multiattach: true }))).toBe(true);
    expect(
      canDetachVolume(
        volume("in-use", {
          attachments: [{ server_id: "server-a" } as Volume["attachments"][number]],
        }),
      ),
    ).toBe(true);
    expect(canSnapshotVolume(volume("in-use"))).toBe(true);
    expect(canDeleteVolume(volume("available"))).toBe(true);
    expect(
      canDeleteVolume(
        volume("available", {
          attachments: [{ server_id: "server-a" } as Volume["attachments"][number]],
        }),
      ),
    ).toBe(false);
  });

  it("recognizes asynchronous volume and snapshot states", () => {
    expect(isVolumeTransitioning(volume("creating"))).toBe(true);
    expect(isVolumeTransitioning(volume("available"))).toBe(false);
    expect(isSnapshotTransitioning(snapshot("deleting"))).toBe(true);
    expect(canDeleteSnapshot(snapshot("available"))).toBe(true);
    expect(canDeleteSnapshot(snapshot("creating"))).toBe(false);
  });

  it("presents Cinder activity with user-facing labels", () => {
    expect(formatVolumeStatus("reserved")).toBe("Preparing Attachment");
    expect(formatVolumeStatus("in-use")).toBe("In Use");
    expect(formatSnapshotStatus("restoring")).toBe("Restoring");
  });
});

describe("Cinder polling updates", () => {
  it("preserves list references when the API object is unchanged", () => {
    const existingVolume = volume("creating");
    const existingSnapshot = snapshot("creating");
    const volumes = [existingVolume];
    const snapshots = [existingSnapshot];
    expect(mergeVolumeUpdates(volumes, new Map([[existingVolume.id, existingVolume]]))).toBe(
      volumes,
    );
    expect(
      mergeSnapshotUpdates(
        snapshots,
        new Map([[existingSnapshot.id, existingSnapshot]]),
      ),
    ).toBe(snapshots);
  });

  it("replaces only resources returned by a poll", () => {
    const existing = volume("creating");
    const updated = volume("available");
    const result = mergeVolumeUpdates([existing], new Map([[updated.id, updated]]));
    expect(result).toEqual([updated]);
  });
});
