import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverBlockStorageCapabilities: vi.fn(),
  discoverComputeCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  guardMutationContext: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  CINDER_BASELINE_MICROVERSION: "3.0",
  CINDER_IN_USE_SNAPSHOT_MICROVERSION: "3.66",
  discoverBlockStorageCapabilities: mocks.discoverBlockStorageCapabilities,
  discoverComputeCapabilities: mocks.discoverComputeCapabilities,
  NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION: "2.85",
}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
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
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: {
        projectToken: "project-token",
        scope,
      },
    });
    mocks.openstackRequest.mockResolvedValue({
      volume: { status: "available" },
    });
    mocks.discoverBlockStorageCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "3.0", maximum: "3.71" },
      serviceType: "volume",
    });
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
        apiVersion: "volume 3.0",
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
    mocks.openstackRequest.mockResolvedValue({
      volume: { status: "in-use" },
    });

    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "before-upgrade",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "volume 3.66",
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

  it("uses baseline snapshot semantics for available volumes", async () => {
    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "detached-volume",
    });

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      apiVersion: "volume 3.0",
      path: "/volumes/volume-a",
      regionId: "RegionOne",
      serviceName: "cinder",
      serviceType: "volumev3",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: "volume 3.0" }),
    );
  });

  it("uses the legacy force flag for attached volumes on older Cinder APIs", async () => {
    mocks.openstackRequest.mockResolvedValue({
      volume: { status: "in-use" },
    });
    mocks.discoverBlockStorageCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "3.0", maximum: "3.65" },
      serviceType: "volume",
    });

    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "legacy-cinder",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "volume 3.0",
        body: {
          snapshot: expect.objectContaining({ force: true }),
        },
      }),
    );
  });

  it("uses the legacy force flag below the configured Cinder ceiling", async () => {
    mocks.openstackRequest.mockResolvedValue({
      volume: { status: "in-use" },
    });
    mocks.discoverBlockStorageCapabilities.mockResolvedValue({
      configuredMicroversionMaximum: "3.65",
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "3.0", maximum: "3.71" },
      serviceType: "volume",
    });

    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "operator-ceiling",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "volume 3.0",
        body: {
          snapshot: expect.objectContaining({ force: true }),
        },
      }),
    );
  });

  it("preserves modern snapshot behavior when Cinder discovery is unavailable", async () => {
    mocks.openstackRequest.mockResolvedValue({
      volume: { status: "in-use" },
    });
    mocks.discoverBlockStorageCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "volume",
    });

    await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "unknown-cinder",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "volume 3.66",
        body: {
          snapshot: expect.objectContaining({ force: undefined }),
        },
      }),
    );
  });

  it("does not create a snapshot when the volume status cannot be verified", async () => {
    mocks.openstackRequest.mockResolvedValue(null);

    const result = await createSnapshotAction(scope, {
      volumeId: "volume-a",
      name: "unknown-volume",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "service-error", retryable: true },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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
