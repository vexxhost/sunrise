import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeOpenStackMutation: vi.fn() }));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

import { createImageAction, updateImageAction } from "@/lib/openstack/glance-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Glance mutation actions", () => {
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

  it("creates a private queued record with explicit format metadata", async () => {
    await createImageAction(scope, {
      name: "cirros-dev",
      diskFormat: "qcow2",
      containerFormat: "bare",
      visibility: "private",
      minDisk: "1",
      minRam: "256",
      protected: false,
      hidden: false,
      tags: ["test"],
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2/images",
        body: expect.objectContaining({
          disk_format: "qcow2",
          container_format: "bare",
          min_disk: 1,
          min_ram: 256,
        }),
      }),
    );
  });

  it("uses Glance JSON Patch for editable metadata", async () => {
    await updateImageAction(scope, "image-a", {
      name: "renamed",
      visibility: "private",
      minDisk: 0,
      minRam: 0,
      protected: true,
      hidden: false,
      tags: ["stable"],
    });
    const options = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(options.headers).toEqual({
      "Content-Type": "application/openstack-images-v2.1-json-patch",
    });
    expect(options.body).toContainEqual({
      op: "replace",
      path: "/protected",
      value: true,
    });
  });
});
