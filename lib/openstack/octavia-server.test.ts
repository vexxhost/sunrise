import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverLoadBalancerCapabilities: mocks.discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION: "2.14",
}));

import {
  getLoadBalancerDetails,
  listLoadBalancerAvailabilityZones,
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
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.0", maximum: "2.30" },
      serviceType: "load-balancer",
    });
  });

  it("negotiates and filters load balancer availability zones", async () => {
    mocks.openstackRequest.mockResolvedValue({
      availability_zones: [
        { name: "zone-b", description: "Second", enabled: true },
        { name: "zone-disabled", enabled: false },
        { name: "zone-a", description: null, enabled: true },
      ],
    });

    await expect(listLoadBalancerAvailabilityZones()).resolves.toEqual({
      availabilityZones: [
        { name: "zone-a", enabled: true },
        { name: "zone-b", description: "Second", enabled: true },
      ],
      support: expect.objectContaining({
        status: "supported",
        requestedMicroversion: "2.14",
      }),
    });
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.14",
        path: "/v2/lbaas/availabilityzones",
      }),
    );
  });

  it("does not query availability zones above the effective ceiling", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      configuredMicroversionMaximum: "2.13",
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.0", maximum: "2.30" },
      serviceType: "load-balancer",
    });

    await expect(listLoadBalancerAvailabilityZones()).resolves.toMatchObject({
      availabilityZones: [],
      support: {
        status: "unsupported",
        message: expect.stringContaining("configured not to request newer"),
      },
    });
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("probes conservatively when Octavia discovery is unavailable", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "load-balancer",
    });
    mocks.openstackRequest.mockResolvedValue({ availability_zones: [] });

    await expect(listLoadBalancerAvailabilityZones()).resolves.toMatchObject({
      availabilityZones: [],
      support: {
        status: "supported",
        requestedMicroversion: "2.14",
      },
    });
  });

  it("does not treat malformed availability-zone payloads as support", async () => {
    mocks.openstackRequest.mockResolvedValue({
      availability_zones: [{ name: "zone-a", enabled: "yes" }],
    });

    await expect(listLoadBalancerAvailabilityZones()).resolves.toMatchObject({
      availabilityZones: [],
      support: {
        status: "unknown",
        message: expect.stringContaining("could not be loaded"),
      },
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
            href: "https://octavia.example/octavia/v2/lbaas/loadbalancers?project_id=project-a&marker=next",
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

  it("rejects pagination targets outside the Octavia API", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({
      loadbalancers: [],
      loadbalancers_links: [
        {
          rel: "next",
          href: "https://octavia.example/octavia/v2/other-resources?marker=next",
        },
      ],
    });

    await expect(listLoadBalancers()).rejects.toThrow(
      "Invalid Octavia loadbalancers pagination target",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(1);
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

  it("loads details through the selected load balancer relationships", async () => {
    const loadBalancerId = "11111111-1111-1111-1111-111111111111";
    const listenerId = "22222222-2222-2222-2222-222222222222";
    const poolId = "33333333-3333-3333-3333-333333333333";
    const healthMonitorId = "44444444-4444-4444-4444-444444444444";
    const policyId = "55555555-5555-5555-5555-555555555555";
    const memberId = "66666666-6666-6666-6666-666666666666";
    const ruleId = "77777777-7777-7777-7777-777777777777";
    const responses = new Map<string, unknown>([
      [
        `/v2/lbaas/loadbalancers/${loadBalancerId}`,
        {
          loadbalancer: {
            ...loadBalancer(loadBalancerId, "project-a", "selected"),
            listeners: [{ id: listenerId }],
            pools: [{ id: poolId }],
          },
        },
      ],
      [
        `/v2/lbaas/listeners/${listenerId}`,
        {
          listener: {
            id: listenerId,
            name: "https",
            project_id: "project-a",
            provisioning_status: "ACTIVE",
            operating_status: "ONLINE",
            admin_state_up: true,
            protocol: "HTTPS",
            protocol_port: 443,
            default_pool_id: poolId,
            l7policies: [{ id: policyId }],
          },
        },
      ],
      [
        `/v2/lbaas/pools/${poolId}`,
        {
          pool: {
            id: poolId,
            name: "api",
            project_id: "project-a",
            provisioning_status: "ACTIVE",
            operating_status: "ONLINE",
            admin_state_up: true,
            protocol: "HTTPS",
            lb_algorithm: "ROUND_ROBIN",
            healthmonitor_id: healthMonitorId,
          },
        },
      ],
      [
        `/v2/lbaas/healthmonitors/${healthMonitorId}`,
        {
          healthmonitor: {
            id: healthMonitorId,
            name: "api",
            project_id: "project-a",
            provisioning_status: "ACTIVE",
            operating_status: "ONLINE",
            admin_state_up: true,
            type: "HTTPS",
            delay: 5,
            timeout: 3,
            max_retries: 3,
          },
        },
      ],
      [
        `/v2/lbaas/l7policies/${policyId}`,
        {
          l7policy: {
            id: policyId,
            name: "api",
            project_id: "project-a",
            provisioning_status: "ACTIVE",
            operating_status: "ONLINE",
            admin_state_up: true,
            action: "REJECT",
            position: 1,
            listener_id: listenerId,
          },
        },
      ],
      [
        `/v2/lbaas/loadbalancers/${loadBalancerId}/stats`,
        {
          stats: {
            active_connections: 1,
            bytes_in: 2,
            bytes_out: 3,
            request_errors: 0,
            total_connections: 4,
          },
        },
      ],
      [
        `/v2/lbaas/loadbalancers/${loadBalancerId}/status`,
        { statuses: { loadbalancer: { id: loadBalancerId } } },
      ],
      [
        `/v2/lbaas/pools/${poolId}/members?limit=100`,
        {
          members: [
            {
              id: memberId,
              name: "control-plane",
              project_id: "project-a",
              provisioning_status: "ACTIVE",
              operating_status: "ONLINE",
              admin_state_up: true,
              address: "10.10.230.10",
              protocol_port: 6443,
            },
          ],
        },
      ],
      [
        `/v2/lbaas/l7policies/${policyId}/rules?limit=100`,
        {
          rules: [
            {
              id: ruleId,
              project_id: "project-a",
              provisioning_status: "ACTIVE",
              operating_status: "ONLINE",
              admin_state_up: true,
              type: "PATH",
              compare_type: "STARTS_WITH",
              value: "/api",
              invert: false,
            },
          ],
        },
      ],
    ]);
    mocks.openstackRequest.mockImplementation(
      async ({ path }: { path: string }) => responses.get(path) ?? null,
    );

    const details = await getLoadBalancerDetails(loadBalancerId);

    expect(details.listeners.map(({ id }) => id)).toEqual([listenerId]);
    expect(details.pools.map(({ id }) => id)).toEqual([poolId]);
    expect(details.healthMonitors.map(({ id }) => id)).toEqual([
      healthMonitorId,
    ]);
    expect(details.l7Policies.map(({ id }) => id)).toEqual([policyId]);
    expect(details.members).toEqual([
      expect.objectContaining({ id: memberId, pool_id: poolId }),
    ]);
    expect(details.l7Rules).toEqual([
      expect.objectContaining({ id: ruleId, l7policy_id: policyId }),
    ]);
    const requestedPaths = mocks.openstackRequest.mock.calls.map(
      ([options]) => options.path,
    );
    expect(requestedPaths).not.toContainEqual(
      expect.stringMatching(
        /^\/v2\/lbaas\/(listeners|pools|healthmonitors|l7policies)\?/,
      ),
    );
  });
});
