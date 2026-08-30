import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeOpenStackMutation: vi.fn() }));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

import {
  attachVolumeAction,
  createSnapshotAction,
  createVolumeAction,
  detachVolumeAction,
} from "@/lib/openstack/cinder-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Cinder mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
  });

  it("narrows volume creation to supported Cinder fields", async () => {
    await createVolumeAction(scope, {
      name: "database",
      description: "Primary data",
      size: "20",
      volumeType: "fast",
      availabilityZone: "nova",
      unexpected: "ignored",
    } as never);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/volumes",
        apiVersion: "volume 3.66",
        body: {
          volume: {
            name: "database",
            description: "Primary data",
            size: 20,
            availability_zone: "nova",
            volume_type: "fast",
          },
        },
      }),
    );
  });

  it("uses modern snapshot semantics without a force flag", async () => {
    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "before-upgrade",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/snapshots",
        body: {
          snapshot: {
            volume_id: "volume-a",
            name: "before-upgrade",
            description: undefined,
          },
        },
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.snapshot.force,
    ).toBeUndefined();
  });

  it("maps attachment operations to Nova 2.79", async () => {
    await attachVolumeAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
      tag: "data",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiVersion: "compute 2.79",
        path: "/servers/server-a/os-volume_attachments",
        body: {
          volumeAttachment: {
            volumeId: "volume-a",
            delete_on_termination: true,
            tag: "data",
          },
        },
      }),
    );

    await detachVolumeAction(scope, { volumeId: "volume-a", serverId: "server-a" });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/servers/server-a/os-volume_attachments/volume-a",
      }),
    );
  });

  it("rejects an invalid device tag before contacting Nova", async () => {
    const result = await attachVolumeAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      tag: "not allowed",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "validation-failed" } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
