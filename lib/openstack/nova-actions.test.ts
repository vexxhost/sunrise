import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/actions", () => ({ openstack: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import {
  createKeypairAction,
  createServerAction,
  deleteKeypairAction,
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
  });

  it("encodes launch user data on the server and narrows the Nova body", async () => {
    await createServerAction(scope, {
      name: "web-1",
      flavorRef: "m1.small",
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
          }),
        },
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.server.unexpected,
    ).toBeUndefined();
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
});
