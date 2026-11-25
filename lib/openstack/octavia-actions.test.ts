import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getLoadBalancer: vi.fn(),
  guardMutationContext: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverLoadBalancerCapabilities: mocks.discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION: "2.14",
  OCTAVIA_BASELINE_MICROVERSION: "2.0",
  OCTAVIA_TAGS_MICROVERSION: "2.5",
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/octavia-server", () => ({
  getLoadBalancer: mocks.getLoadBalancer,
  getLoadBalancerDetails: vi.fn(),
  listLoadBalancerAvailabilityZones: vi.fn(),
  listLoadBalancers: vi.fn(),
}));

import {
  createLoadBalancerAction,
  deleteLoadBalancerAction,
  updateLoadBalancerAction,
} from "@/lib/openstack/octavia-actions";

const scope = {
  projectId: "297c1aa4-ef4f-42bf-9fdb-6a7c6ced78b2",
  regionId: "RegionOne",
};
const vipSubnetId = "2217ca4f-3722-40ae-88cc-20fb92f21395";
const loadBalancerId = "4ed3f70c-5126-470d-be60-3710d8682220";

function existingLoadBalancer(overrides: Record<string, unknown> = {}) {
  return {
    admin_state_up: true,
    description: "Current description",
    id: loadBalancerId,
    listeners: [],
    name: "application",
    operating_status: "ONLINE",
    pools: [],
    project_id: scope.projectId,
    provisioning_status: "ACTIVE",
    tags: ["env:test"],
    ...overrides,
  };
}

function capabilities(maximum = "2.30") {
  return {
    discoveryStatus: "available" as const,
    message: "Octavia microversions discovered.",
    microversions: { minimum: "2.0", maximum },
    serviceType: "load-balancer",
  };
}

describe("Octavia load balancer mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "project-token", scope },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities());
    mocks.getLoadBalancer.mockResolvedValue(existingLoadBalancer());
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      data: null,
      message: options.successMessage,
      ok: true,
      scope,
      status: "success",
    }));
  });

  it("creates the baseline VIP in the active project", async () => {
    await expect(
      createLoadBalancerAction(scope, {
        adminStateUp: true,
        name: "application",
        vipSubnetId,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "create a load balancer",
        apiVersion: "load-balancer 2.0",
        body: {
          loadbalancer: {
            admin_state_up: true,
            availability_zone: undefined,
            description: undefined,
            name: "application",
            project_id: scope.projectId,
            tags: undefined,
            vip_subnet_id: vipSubnetId,
          },
        },
        method: "POST",
        path: "/v2/lbaas/loadbalancers",
        scope,
      }),
    );
  });

  it("requests the tags microversion and preserves opaque tag values", async () => {
    await createLoadBalancerAction(scope, {
      name: "tagged",
      tags: ["env:test", " Team A "],
      vipSubnetId,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.5",
        body: expect.objectContaining({
          loadbalancer: expect.objectContaining({
            tags: ["env:test", " Team A "],
          }),
        }),
      }),
    );
  });

  it("uses the availability-zone microversion when placement and tags are set", async () => {
    await createLoadBalancerAction(scope, {
      availabilityZone: "nova",
      name: "zoned",
      tags: ["env:test"],
      vipSubnetId,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.14",
        body: expect.objectContaining({
          loadbalancer: expect.objectContaining({
            availability_zone: "nova",
            tags: ["env:test"],
          }),
        }),
      }),
    );
  });

  it("preserves operator-defined availability-zone names", async () => {
    await createLoadBalancerAction(scope, {
      availabilityZone: " edge zone ",
      name: "zoned",
      vipSubnetId,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          loadbalancer: expect.objectContaining({
            availability_zone: " edge zone ",
          }),
        }),
      }),
    );
  });

  it("rejects whitespace-only availability-zone names", async () => {
    const result = await createLoadBalancerAction(scope, {
      availabilityZone: "   ",
      name: "zoned",
      vipSubnetId,
    });

    expect(result).toMatchObject({
      error: { code: "validation-failed" },
      ok: false,
    });
    expect(mocks.guardMutationContext).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid tags before reading mutation context", async () => {
    const result = await createLoadBalancerAction(scope, {
      name: "invalid",
      tags: ["path/value"],
      vipSubnetId,
    });

    expect(result).toMatchObject({
      error: { code: "validation-failed" },
      ok: false,
    });
    expect(mocks.guardMutationContext).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("guards the active scope before capability discovery", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        error: {
          code: "context-changed",
          message: "The active project changed.",
          retryable: true,
        },
        ok: false,
        status: "error",
      },
    });

    const result = await createLoadBalancerAction(scope, {
      name: "stale",
      vipSubnetId,
    });

    expect(result).toMatchObject({
      error: { code: "context-changed" },
      ok: false,
    });
    expect(mocks.discoverLoadBalancerCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not send unsupported tag fields to an older Octavia API", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(
      capabilities("2.4"),
    );

    const result = await createLoadBalancerAction(scope, {
      name: "unsupported",
      tags: ["env:test"],
      vipSubnetId,
    });

    expect(result).toMatchObject({
      error: { code: "service-unavailable", retryable: false },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("accepts only a created load balancer owned by the active project", async () => {
    await createLoadBalancerAction(scope, {
      name: "validated",
      vipSubnetId,
    });
    const transform = mocks.executeOpenStackMutation.mock.calls[0][0]
      .transform as (payload: unknown) => unknown;
    const loadBalancer = {
      id: loadBalancerId,
      name: "validated",
      project_id: scope.projectId.replaceAll("-", ""),
    };

    expect(transform({ loadbalancer: loadBalancer })).toBe(loadBalancer);
    expect(() =>
      transform({ loadbalancer: { ...loadBalancer, project_id: "project-b" } }),
    ).toThrow("invalid load balancer");
    expect(() => transform({ loadbalancer: [] })).toThrow(
      "invalid load balancer",
    );
    expect(() => transform({ loadbalancer: null })).toThrow(
      "invalid load balancer",
    );
  });

  it("updates baseline properties without requiring tag support", async () => {
    await expect(
      updateLoadBalancerAction(scope, loadBalancerId, {
        adminStateUp: false,
        description: "Updated",
        name: "application-new",
        source: {
          adminStateUp: true,
          description: "Current description",
          name: "application",
          tags: ["env:test"],
        },
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.getLoadBalancer).toHaveBeenCalledWith(
      loadBalancerId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.0",
        body: {
          loadbalancer: {
            admin_state_up: false,
            description: "Updated",
            name: "application-new",
          },
        },
        method: "PUT",
        path: `/v2/lbaas/loadbalancers/${loadBalancerId}`,
      }),
    );
  });

  it("allows an optional load balancer name to be cleared", async () => {
    await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
      },
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          loadbalancer: expect.objectContaining({ name: "" }),
        },
      }),
    );
  });

  it("uses microversion 2.5 for exact tag replacement", async () => {
    const originalTags = ["first\r\nold\nliteral\\r"];
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ tags: originalTags }),
    );
    const tags = [" Team A ", "first\r\nsecond\nliteral\\r", "env:prod"];
    await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "application",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
        tags: originalTags,
      },
      tags,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.5",
        body: {
          loadbalancer: expect.objectContaining({
            tags,
          }),
        },
      }),
    );
  });

  it("rejects stale property and tag snapshots before mutation", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ name: "changed-remotely" }),
    );

    const result = await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "new-name",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
        tags: ["env:test"],
      },
      tags: ["env:prod"],
    });

    expect(result).toMatchObject({
      error: { code: "conflict", retryable: true },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects mutations while Octavia is already provisioning", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ provisioning_status: "pending_update" }),
    );

    const result = await deleteLoadBalancerAction(scope, loadBalancerId);

    expect(result).toMatchObject({
      error: { code: "conflict", retryable: true },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("deletes an empty project-owned load balancer", async () => {
    await expect(
      deleteLoadBalancerAction(scope, loadBalancerId),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.0",
        method: "DELETE",
        path: `/v2/lbaas/loadbalancers/${loadBalancerId}`,
        removedResource: { id: loadBalancerId, kind: "load-balancer" },
      }),
    );
  });

  it("refuses non-cascade deletion when topology remains", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ listeners: [{ id: "listener-id" }] }),
    );

    const result = await deleteLoadBalancerAction(scope, loadBalancerId);

    expect(result).toMatchObject({
      error: {
        code: "validation-failed",
        message: expect.stringContaining("listeners and pools"),
      },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not send tag updates to an older Octavia API", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(
      capabilities("2.4"),
    );

    const result = await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "application",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
        tags: ["env:test"],
      },
      tags: ["env:prod"],
    });

    expect(result).toMatchObject({
      error: { code: "service-unavailable", retryable: false },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not replace tags if the preflight response omitted them", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ tags: undefined }),
    );

    const result = await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "application",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
        tags: [],
      },
      tags: ["env:prod"],
    });

    expect(result).toMatchObject({
      error: {
        code: "service-error",
        message: expect.stringContaining("did not return the existing tags"),
      },
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps mutation preflight failures before capability discovery", async () => {
    mocks.getLoadBalancer.mockRejectedValue({
      name: "OpenStackRequestError",
      status: 404,
    });

    const result = await deleteLoadBalancerAction(scope, loadBalancerId);

    expect(result).toMatchObject({
      error: { code: "not-found", retryable: false },
      ok: false,
    });
    expect(mocks.discoverLoadBalancerCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("accepts only the updated active-project load balancer", async () => {
    await updateLoadBalancerAction(scope, loadBalancerId, {
      adminStateUp: true,
      description: "Current description",
      name: "updated",
      source: {
        adminStateUp: true,
        description: "Current description",
        name: "application",
      },
    });
    const transform = mocks.executeOpenStackMutation.mock.calls[0][0]
      .transform as (payload: unknown) => unknown;
    const updated = existingLoadBalancer({ name: "updated" });

    expect(transform({ loadbalancer: updated })).toBe(updated);
    expect(() =>
      transform({ loadbalancer: { ...updated, id: vipSubnetId } }),
    ).toThrow("invalid load balancer");
    expect(() =>
      transform({ loadbalancer: { ...updated, project_id: "project-b" } }),
    ).toThrow("invalid load balancer");
  });
});
