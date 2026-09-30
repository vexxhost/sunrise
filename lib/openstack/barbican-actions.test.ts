import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
  listSecretConsumers: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/barbican-server", () => ({
  BARBICAN_API_VERSION: "key-manager 1.1",
  BARBICAN_SERVICE: { serviceType: "key-manager", serviceName: "barbican" },
  barbicanResourceId: (value: string) => value,
  listSecretConsumers: mocks.listSecretConsumers,
}));

import {
  deleteContainerAction,
  deleteOrderAction,
  deleteSecretAction,
} from "@/lib/openstack/barbican-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };
const secretId = "11111111-1111-4111-8111-111111111111";
const containerId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";

describe("Barbican mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSecretConsumers.mockResolvedValue([]);
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
  });

  it.each([
    [deleteSecretAction, secretId, "secrets", "secret"],
    [deleteContainerAction, containerId, "containers", "secret-container"],
    [deleteOrderAction, orderId, "orders", "secret-order"],
  ] as const)(
    "removes a deleted %s from saved resources",
    async (action, id, collection, kind) => {
      await action(scope, id);

      expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "DELETE",
          path: `/v1/${collection}/${id}`,
          removedResource: { kind, id },
        }),
      );
    },
  );

  it("does not delete a secret with registered consumers", async () => {
    mocks.listSecretConsumers.mockResolvedValue([
      {
        service: "nova",
        resource_type: "server",
        resource_id: "server-a",
      },
    ]);

    const result = await deleteSecretAction(scope, secretId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects malformed resource IDs before a service request", async () => {
    const result = await deleteSecretAction(scope, "not-a-uuid");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "Resource ID must be a UUID.",
      },
    });
    expect(mocks.listSecretConsumers).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
