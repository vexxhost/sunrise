import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import {
  getLoadBalancerDetails,
  listLoadBalancers,
} from "@/lib/openstack/octavia-server";
import { OpenStackRequestError } from "@/lib/openstack/request";

function loadBalancer(id: string, projectId: string, name: string) {
  return {
    id,
    name,
    project_id: projectId,
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    admin_state_up: true,
  };
}

describe("Octavia project scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
  });

  it("paginates and filters load balancers to the active project", async () => {
    mocks.openstackRequest
      .mockResolvedValueOnce({
        loadbalancers: [
          loadBalancer(
            "11111111-1111-1111-1111-111111111111",
            "project-a",
            "zulu",
          ),
          loadBalancer(
            "22222222-2222-2222-2222-222222222222",
            "project-b",
            "other",
          ),
        ],
        loadbalancers_links: [
          {
            rel: "next",
            href: "https://octavia.example/v2/lbaas/loadbalancers?project_id=project-a&marker=next",
          },
        ],
      })
      .mockResolvedValueOnce({
        loadbalancers: [
          loadBalancer(
            "33333333-3333-3333-3333-333333333333",
            "project-a",
            "alpha",
          ),
        ],
      });

    await expect(listLoadBalancers()).resolves.toEqual([
      expect.objectContaining({ name: "alpha" }),
      expect.objectContaining({ name: "zulu" }),
    ]);
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/v2/lbaas/loadbalancers?limit=100&project_id=project-a",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/v2/lbaas/loadbalancers?project_id=project-a&marker=next",
      }),
    );
  });

  it("rejects a scope supplied from a stale client session", async () => {
    await expect(listLoadBalancers("RegionTwo", "project-a")).rejects.toThrow(
      "region does not match",
    );
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("treats a cross-project load balancer as missing", async () => {
    mocks.openstackRequest.mockResolvedValue({
      loadbalancer: loadBalancer(
        "11111111-1111-1111-1111-111111111111",
        "project-b",
        "other",
      ),
    });

    await expect(
      getLoadBalancerDetails("11111111-1111-1111-1111-111111111111"),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed resource IDs before making an API request", async () => {
    await expect(getLoadBalancerDetails("../other-project")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });
});
