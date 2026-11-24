import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
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

import { createLoadBalancerAction } from "@/lib/openstack/octavia-actions";

const scope = {
  projectId: "297c1aa4-ef4f-42bf-9fdb-6a7c6ced78b2",
  regionId: "RegionOne",
};
const vipSubnetId = "2217ca4f-3722-40ae-88cc-20fb92f21395";
const loadBalancerId = "4ed3f70c-5126-470d-be60-3710d8682220";

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
});
