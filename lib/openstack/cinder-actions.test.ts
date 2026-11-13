import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverComputeCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverComputeCapabilities: mocks.discoverComputeCapabilities,
  NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION: "2.85",
}));

import {
  attachVolumeAction,
  createSnapshotAction,
  createVolumeAction,
  deleteVolumeAction,
  detachVolumeAction,
  updateVolumeAttachmentAction,
} from "@/lib/openstack/cinder-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Cinder mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discoverComputeCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.1", maximum: "2.100" },
      serviceType: "compute",
    });
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

  it("removes a deleted volume from saved resources", async () => {
    await deleteVolumeAction(scope, "volume-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/volumes/volume-a",
        removedResource: { kind: "volume", id: "volume-a" },
      }),
    );
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

    await detachVolumeAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/servers/server-a/os-volume_attachments/volume-a",
      }),
    );
  });

  it("updates delete-on-termination using Nova 2.85", async () => {
    await updateVolumeAttachmentAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "PUT",
        apiVersion: "compute 2.85",
        path: "/servers/server-a/os-volume_attachments/volume-a",
        body: {
          volumeAttachment: {
            volumeId: "volume-a",
            delete_on_termination: true,
          },
        },
      }),
    );
  });

  it("negotiates up to Nova's advertised minimum microversion", async () => {
    mocks.discoverComputeCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.90", maximum: "2.100" },
      serviceType: "compute",
    });

    await updateVolumeAttachmentAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiVersion: "compute 2.90" }),
    );
  });

  it("preserves the API call when Nova capability discovery is unavailable", async () => {
    mocks.discoverComputeCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "compute",
    });

    await updateVolumeAttachmentAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiVersion: "compute 2.85" }),
    );
  });

  it("rejects attachment policy updates when Nova is too old", async () => {
    mocks.discoverComputeCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.1", maximum: "2.84" },
      serviceType: "compute",
    });

    const result = await updateVolumeAttachmentAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("2.85"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects attachment policy updates above the configured ceiling", async () => {
    mocks.discoverComputeCapabilities.mockResolvedValue({
      configuredMicroversionMaximum: "2.84",
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.1", maximum: "2.100" },
      serviceType: "compute",
    });

    const result = await updateVolumeAttachmentAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      deleteOnTermination: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("configured not to request newer"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects an invalid device tag before contacting Nova", async () => {
    const result = await attachVolumeAction(scope, {
      volumeId: "volume-a",
      serverId: "server-a",
      tag: "not allowed",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
