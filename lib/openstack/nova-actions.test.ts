import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import {
  attachPortAction,
  createKeypairAction,
  createServerAction,
  deleteServerAction,
  deleteKeypairAction,
  detachPortAction,
  getServerConsoleOutputAction,
  replaceServerMetadataAction,
  runServerLifecycleAction,
} from "@/lib/openstack/nova-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Nova mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
    mocks.openstackRequest.mockResolvedValue({ output: "boot complete" });
  });

  it("encodes launch user data on the server and narrows the Nova body", async () => {
    await createServerAction(scope, {
      name: "web-1",
      description: "Frontend workload",
      count: 3,
      flavorRef: "m1.small",
      bootSource: "image",
      imageRef: "image-a",
      networkIds: ["network-a"],
      securityGroupNames: ["default"],
      metadata: { role: "web" },
      userData: "#cloud-config\npackages: []",
      configDrive: true,
      unexpected: "ignored",
    } as never);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          server: expect.objectContaining({
            name: "web-1",
            description: "Frontend workload",
            flavorRef: "m1.small",
            imageRef: "image-a",
            networks: [{ uuid: "network-a" }],
            security_groups: [{ name: "default" }],
            metadata: { role: "web" },
            user_data: Buffer.from(
              "#cloud-config\npackages: []",
              "utf8",
            ).toString("base64"),
            config_drive: true,
            min_count: 3,
            max_count: 3,
          }),
        },
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.server.unexpected,
    ).toBeUndefined();
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        successMessage: "3 instances are being created.",
      }),
    );
  });

  it("creates an image-backed boot volume through Nova block device mapping", async () => {
    await createServerAction(scope, {
      name: "database-1",
      count: 2,
      flavorRef: "m1.small",
      bootSource: "image-volume",
      imageRef: "image-a",
      volumeSize: 40,
      volumeType: "fast-type-id",
      deleteOnTermination: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          server: expect.objectContaining({
            block_device_mapping_v2: [
              {
                boot_index: 0,
                uuid: "image-a",
                source_type: "image",
                destination_type: "volume",
                volume_size: 40,
                volume_type: "fast-type-id",
                delete_on_termination: true,
              },
            ],
            min_count: 2,
            max_count: 2,
          }),
        },
        invalidates: ["/compute", "/compute/instances", "/compute/volumes"],
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.server,
    ).not.toHaveProperty("imageRef");
  });

  it("boots one instance from an existing volume without creating storage", async () => {
    await createServerAction(scope, {
      name: "recovered-server",
      count: 1,
      flavorRef: "m1.small",
      bootSource: "volume",
      volumeRef: "volume-a",
      deleteOnTermination: false,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          server: expect.objectContaining({
            block_device_mapping_v2: [
              {
                boot_index: 0,
                uuid: "volume-a",
                source_type: "volume",
                destination_type: "volume",
                delete_on_termination: false,
              },
            ],
          }),
        },
        invalidates: ["/compute", "/compute/instances"],
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.server,
    ).not.toHaveProperty("imageRef");
  });

  it("rejects launching multiple instances from one existing volume", async () => {
    const result = await createServerAction(scope, {
      name: "invalid-group",
      count: 2,
      flavorRef: "m1.small",
      bootSource: "volume",
      volumeRef: "volume-a",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "An existing boot volume can launch only one instance.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects a launch count below one before contacting Nova", async () => {
    const result = await createServerAction(scope, {
      name: "web-1",
      count: 0,
      flavorRef: "m1.small",
      bootSource: "image",
      imageRef: "image-a",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid metadata before contacting Nova", async () => {
    const result = await replaceServerMetadataAction(scope, "server-a", {
      ["x".repeat(256)]: "value",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps lifecycle actions to Nova's supported request bodies", async () => {
    await runServerLifecycleAction(scope, "server-a", "hard-reboot");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/servers/server-a/action",
        body: { reboot: { type: "HARD" } },
        successMessage: "Forced reboot requested.",
      }),
    );
  });

  it("removes a deleted instance from saved resources", async () => {
    await deleteServerAction(scope, "server-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/servers/server-a",
        removedResource: { kind: "instance", id: "server-a" },
      }),
    );
  });

  it("attaches and detaches existing Neutron ports through Nova", async () => {
    await attachPortAction(scope, { portId: "port-a", serverId: "server-a" });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiVersion: "compute 2.79",
        method: "POST",
        path: "/servers/server-a/os-interface",
        body: { interfaceAttachment: { port_id: "port-a" } },
      }),
    );

    await detachPortAction(scope, { portId: "port-a", serverId: "server-a" });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiVersion: "compute 2.79",
        method: "DELETE",
        path: "/servers/server-a/os-interface/port-a",
      }),
    );
  });

  it("rejects an empty interface attachment before contacting Nova", async () => {
    const result = await attachPortAction(scope, {
      portId: "",
      serverId: "server-a",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("omits public key material when asking Nova to generate a key pair", async () => {
    await createKeypairAction(scope, { name: "operator-key" });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          keypair: {
            name: "operator-key",
            type: "ssh",
            public_key: undefined,
          },
        },
      }),
    );
  });

  it("URL-encodes a validated key-pair name before deletion", async () => {
    await deleteKeypairAction(scope, "operator.key");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/os-keypairs/operator.key",
      }),
    );
  });

  it("retrieves console output through a constrained Nova action", async () => {
    await expect(
      getServerConsoleOutputAction("server-a", 200, "RegionOne"),
    ).resolves.toBe("boot complete");

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/server-a/action",
      method: "POST",
      apiVersion: "compute 2.79",
      body: { "os-getConsoleOutput": { length: 200 } },
    });
  });

  it("rejects invalid console output requests before contacting Nova", async () => {
    await expect(
      getServerConsoleOutputAction("server-a", -1, "RegionOne"),
    ).rejects.toThrow("Invalid console output request");

    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });
});
