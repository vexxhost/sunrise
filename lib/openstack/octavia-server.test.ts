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
  OCTAVIA_TAGS_MICROVERSION: "2.5",
}));

import {
  getLoadBalancer,
  getLoadBalancerDetails,
  getLoadBalancerListener,
  getLoadBalancerListenerDetails,
  getLoadBalancerPool,
  getLoadBalancerPoolDetails,
  getOctaviaL7Rule,
  getOctaviaListenerL7Policy,
  getOctaviaPoolHealthMonitor,
  getOctaviaPoolMember,
  listLoadBalancerAvailabilityZones,
  listLoadBalancerPoolChoices,
  listLoadBalancers,
  listOctaviaPoolRedirectPolicies,
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
        apiVersion: "load-balancer 2.5",
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

  it("falls back to baseline reads when an undiscoverable cloud rejects tag microversions", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "load-balancer",
    });
    mocks.openstackRequest
      .mockRejectedValueOnce(
        new OpenStackRequestError(406, "Microversion is not supported"),
      )
      .mockResolvedValueOnce({
        loadbalancers: [
          loadBalancer(
            "11111111-1111-1111-1111-111111111111",
            "project-a",
            "application",
          ),
        ],
      });

    await expect(listLoadBalancers()).resolves.toHaveLength(1);
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ apiVersion: "load-balancer 2.5" }),
    );
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ apiVersion: undefined }),
    );
  });

  it("does not hide a tag-read failure after support was advertised", async () => {
    mocks.openstackRequest.mockRejectedValue(
      new OpenStackRequestError(406, "Microversion is not supported"),
    );

    await expect(listLoadBalancers()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 406,
    );
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(1);
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

  it("reads only an active-project load balancer for mutation preflight", async () => {
    const resource = loadBalancer(
      "11111111-1111-1111-1111-111111111111",
      "project-a",
      "application",
    );
    mocks.openstackRequest.mockResolvedValue({ loadbalancer: resource });

    await expect(
      getLoadBalancer("11111111-1111-1111-1111-111111111111"),
    ).resolves.toBe(resource);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2/lbaas/loadbalancers/11111111-1111-1111-1111-111111111111",
      }),
    );
  });

  it("rejects a cross-project mutation-preflight resource", async () => {
    mocks.openstackRequest.mockResolvedValue({
      loadbalancer: loadBalancer(
        "11111111-1111-1111-1111-111111111111",
        "project-b",
        "other",
      ),
    });

    await expect(
      getLoadBalancer("11111111-1111-1111-1111-111111111111"),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
  });

  it("loads a listener deep link through only the scoped parent and listener", async () => {
    const parentId = "44444444-4444-4444-8444-444444444444";
    const listenerId = "22222222-2222-4222-8222-222222222222";
    const listener = {
      id: listenerId,
      project_id: "project-a",
      loadbalancers: [{ id: parentId }],
      insert_headers: { "X-Forwarded-For": "true" },
    };
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.endsWith(parentId)
        ? { loadbalancer: loadBalancer(parentId, "project-a", "application") }
        : { listener },
    );
    await expect(
      getLoadBalancerListenerDetails(
        parentId,
        listenerId,
        "RegionOne",
        "project-a",
      ),
    ).resolves.toMatchObject({ listener, loadBalancer: { id: parentId } });
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(2);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v2/lbaas/listeners/${listenerId}`,
        apiVersion: "load-balancer 2.12",
      }),
    );
    mocks.openstackRequest.mockClear();
    await expect(
      getLoadBalancerListenerDetails(
        parentId,
        listenerId,
        "RegionTwo",
        "project-a",
      ),
    ).rejects.toThrow("Octavia region does not match");
    expect(mocks.openstackRequest).not.toHaveBeenCalled();

    for (const invalidListener of [
      { ...listener, project_id: "project-b" },
      { ...listener, loadbalancers: [{ id: listenerId }] },
    ]) {
      mocks.openstackRequest.mockImplementation(async ({ path }) =>
        path.endsWith(parentId)
          ? { loadbalancer: loadBalancer(parentId, "project-a", "application") }
          : { listener: invalidListener },
      );
      await expect(
        getLoadBalancerListenerDetails(parentId, listenerId),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("checks both the returned listener and its parent before a mutation", async () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const listener = {
      id,
      project_id: "project-a",
      loadbalancers: [{ id: parentId }],
    };
    mocks.openstackRequest.mockResolvedValue({ listener });
    await expect(getLoadBalancerListener(parentId, id)).resolves.toEqual(
      listener,
    );
    for (const invalid of [
      { ...listener, project_id: "project-b" },
      { ...listener, id: parentId },
      { ...listener, loadbalancers: [{ id }] },
      { ...listener, loadbalancers: undefined },
    ]) {
      mocks.openstackRequest.mockResolvedValue({ listener: invalid });
      await expect(getLoadBalancerListener(parentId, id)).rejects.toMatchObject(
        { status: 404 },
      );
    }
  });

  it.each([false, true])(
    "refreshes the parent once when a listener disappears (still referenced: %s)",
    async (stillReferenced) => {
      const parentId = "11111111-1111-4111-8111-111111111111";
      const id = "22222222-2222-4222-8222-222222222222";
      const first = {
        ...loadBalancer(parentId, "project-a", "application"),
        listeners: [{ id }],
      };
      const refreshed = {
        ...first,
        listeners: stillReferenced ? [{ id }] : [],
      };
      let parentReads = 0;
      mocks.openstackRequest.mockImplementation(async ({ path }) => {
        if (path === "/v2/lbaas/loadbalancers/" + parentId) {
          return { loadbalancer: ++parentReads === 1 ? first : refreshed };
        }
        if (path === "/v2/lbaas/listeners/" + id) {
          throw new OpenStackRequestError(404, "Listener not found");
        }
        return null;
      });
      const details = getLoadBalancerDetails(parentId);
      if (stillReferenced) {
        await expect(details).rejects.toThrow(
          "missing listener in the load balancer topology",
        );
      } else {
        await expect(details).resolves.toMatchObject({
          loadBalancer: refreshed,
          listeners: [],
        });
      }
      expect(parentReads).toBe(2);
    },
  );

  it("rejects malformed resource IDs before making an API request", async () => {
    await expect(getLoadBalancerDetails("../other-project")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("checks the identity and parent of a pool before mutation", async () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const pool = {
      id,
      project_id: "project-a",
      loadbalancers: [{ id: parentId }],
    };
    mocks.openstackRequest.mockResolvedValue({ pool });
    await expect(getLoadBalancerPool(parentId, id)).resolves.toEqual(pool);
    for (const invalid of [
      { ...pool, project_id: "project-b" },
      { ...pool, id: parentId },
      { ...pool, loadbalancers: [{ id }] },
      { ...pool, loadbalancers: undefined },
    ]) {
      mocks.openstackRequest.mockResolvedValue({ pool: invalid });
      await expect(getLoadBalancerPool(parentId, id)).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it("reads a member through its pool and verifies the project and member identity", async () => {
    const poolId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const member = { id, project_id: "project-a" };
    mocks.openstackRequest.mockResolvedValue({ member });
    await expect(
      getOctaviaPoolMember(poolId, id, "RegionOne", "project-a"),
    ).resolves.toMatchObject({ ...member, pool_id: poolId });
    expect(mocks.openstackRequest).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        path: `/v2/lbaas/pools/${poolId}/members/${id}`,
      }),
    );
    for (const invalid of [
      { ...member, project_id: "project-b" },
      { ...member, id: poolId },
      { ...member, pool_id: id },
    ]) {
      mocks.openstackRequest.mockResolvedValue({ member: invalid });
      await expect(getOctaviaPoolMember(poolId, id)).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it("rejects a health monitor unless its identity, project and pool agree", async () => {
    const poolId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const healthmonitor = {
      id,
      project_id: "project-a",
      pools: [{ id: poolId }],
    };
    mocks.openstackRequest.mockResolvedValue({ healthmonitor });
    await expect(getOctaviaPoolHealthMonitor(poolId, id)).resolves.toEqual(
      healthmonitor,
    );
    for (const overrides of [
      { id: poolId },
      { project_id: "project-b" },
      { pools: [{ id }] },
      { pools: [{ id: poolId }, { id }] },
      { pools: undefined },
    ]) {
      mocks.openstackRequest.mockResolvedValue({
        healthmonitor: { ...healthmonitor, ...overrides },
      });
      await expect(
        getOctaviaPoolHealthMonitor(poolId, id),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("only offers pools belonging to the scoped load balancer", async () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const unrelatedParentId = "11111111-1111-4111-8111-999999999999";
    const ids = Array.from(
      { length: 4 },
      (_, i) => `22222222-2222-4222-8222-22222222222${i}`,
    );
    const [owned, wrongOwner, wrongParent, unlisted] = ids;
    const pool = {
      id: owned,
      name: "backend",
      protocol: "HTTP",
      provisioning_status: "ACTIVE",
      admin_state_up: false,
      project_id: "project-a",
      loadbalancers: [{ id: parentId }],
      members: [{ id: "member" }],
    };
    mocks.openstackRequest
      .mockResolvedValueOnce({
        loadbalancer: {
          ...loadBalancer(parentId, "project-a", "app"),
          pools: ids.slice(0, 3).map((id) => ({ id })),
        },
      })
      .mockResolvedValueOnce({
        pools: [
          pool,
          { ...pool, id: wrongOwner, project_id: "project-b" },
          {
            ...pool,
            id: wrongParent,
            loadbalancers: [{ id: unrelatedParentId }],
          },
          { ...pool, id: unlisted },
        ],
      });
    await expect(
      listLoadBalancerPoolChoices(parentId, "RegionOne", "project-a"),
    ).resolves.toEqual([
      {
        id: owned,
        name: "backend",
        protocol: "HTTP",
        provisioning_status: "ACTIVE",
        admin_state_up: false,
        memberCount: 1,
      },
    ]);
    expect(mocks.openstackRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `/v2/lbaas/pools?limit=100&project_id=project-a&loadbalancer_id=${parentId}`,
      }),
    );
  });

  it("keeps pool and project filters on every L7 page and verifies the returned relationships", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const matchingPolicy = {
      id: "policy-one",
      project_id: "project-a",
      redirect_pool_id: id,
      admin_state_up: false,
      rules: [],
    };
    mocks.openstackRequest
      .mockResolvedValueOnce({
        l7policies: [{ ...matchingPolicy, redirect_pool_id: null }],
        l7policies_links: [
          {
            rel: "next",
            href: "https://octavia.example/v2/lbaas/l7policies?limit=100&marker=first",
          },
        ],
      })
      .mockResolvedValueOnce({
        l7policies: [
          matchingPolicy,
          { ...matchingPolicy, project_id: "project-b" },
        ],
      });

    await expect(
      listOctaviaPoolRedirectPolicies(id, "RegionOne", "project-a"),
    ).resolves.toEqual([matchingPolicy]);
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(2);
    for (const [{ path }] of mocks.openstackRequest.mock.calls) {
      const url = new URL(path, "https://octavia.example");
      expect(url.pathname).toBe("/v2/lbaas/l7policies");
      expect(url.searchParams.get("project_id")).toBe("project-a");
      expect(url.searchParams.get("redirect_pool_id")).toBe(id);
    }
    expect(mocks.openstackRequest.mock.calls[1][0].path).toContain(
      "marker=first",
    );
  });

  it.each([
    { missing: "pool", stillReferenced: false },
    { missing: "members", stillReferenced: false },
    { missing: "pool", stillReferenced: true },
  ])(
    "retries a topology read when $missing disappears (still referenced: $stillReferenced)",
    async ({ missing, stillReferenced }) => {
      const parentId = "11111111-1111-4111-8111-111111111111";
      const id = "22222222-2222-4222-8222-222222222222";
      const parent = loadBalancer(parentId, "project-a", "application");
      let reads = 0;
      mocks.openstackRequest.mockImplementation(async ({ path }) => {
        if (path === "/v2/lbaas/loadbalancers/" + parentId) {
          return {
            loadbalancer: {
              ...parent,
              pools: ++reads === 1 || stillReferenced ? [{ id }] : [],
            },
          };
        }
        if (path === "/v2/lbaas/pools/" + id && missing === "members") {
          return { pool: { id, project_id: "project-a" } };
        }
        if (path.startsWith("/v2/lbaas/pools/" + id)) {
          throw new OpenStackRequestError(404, "Pool not found");
        }
        return null;
      });
      const details = getLoadBalancerDetails(parentId);
      if (stillReferenced) {
        await expect(details).rejects.toThrow(
          "missing pool or child resource in the topology",
        );
      } else {
        await expect(details).resolves.toMatchObject({
          pools: [],
          members: [],
        });
      }
      expect(reads).toBe(2);
    },
  );

  it("reads an L7 policy only for its current project and listener", async () => {
    const listenerId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const l7policy = { id, listener_id: listenerId, project_id: "project-a" };
    mocks.openstackRequest.mockResolvedValue({ l7policy });
    await expect(getOctaviaListenerL7Policy(listenerId, id)).resolves.toEqual(
      l7policy,
    );
    for (const changed of [
      { id: listenerId },
      { listener_id: id },
      { project_id: "project-b" },
    ]) {
      mocks.openstackRequest.mockResolvedValueOnce({
        l7policy: { ...l7policy, ...changed },
      });
      await expect(
        getOctaviaListenerL7Policy(listenerId, id),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("reads an L7 rule only through its policy and checks both project and identity", async () => {
    const policyId = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const rule = { id, project_id: "project-a" };
    mocks.openstackRequest.mockResolvedValue({ rule });
    await expect(getOctaviaL7Rule(policyId, id)).resolves.toMatchObject({
      ...rule,
      l7policy_id: policyId,
    });
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v2/lbaas/l7policies/${policyId}/rules/${id}`,
      }),
    );
    for (const changed of [
      { id: policyId },
      { l7policy_id: id },
      { project_id: "project-b" },
    ]) {
      mocks.openstackRequest.mockResolvedValueOnce({
        rule: { ...rule, ...changed },
      });
      await expect(getOctaviaL7Rule(policyId, id)).rejects.toMatchObject({
        status: 404,
      });
    }
  });

  it("retries when a health monitor disappears after the pool is read", async () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const poolId = "22222222-2222-4222-8222-222222222222";
    const monitorId = "33333333-3333-4333-8333-333333333333";
    let poolReads = 0;
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === `/v2/lbaas/loadbalancers/${parentId}`) {
        return {
          loadbalancer: {
            ...loadBalancer(parentId, "project-a", "application"),
            pools: [{ id: poolId }],
          },
        };
      }
      if (path === `/v2/lbaas/pools/${poolId}`) {
        return {
          pool: {
            id: poolId,
            project_id: "project-a",
            healthmonitor_id: ++poolReads === 1 ? monitorId : null,
          },
        };
      }
      if (path === `/v2/lbaas/healthmonitors/${monitorId}`) {
        throw new OpenStackRequestError(404, "Health monitor not found");
      }
      if (path === `/v2/lbaas/pools/${poolId}/members?limit=100`) {
        return { members: [] };
      }
      return null;
    });
    await expect(getLoadBalancerDetails(parentId)).resolves.toMatchObject({
      pools: [{ id: poolId, healthmonitor_id: null }],
      healthMonitors: [],
    });
    expect(poolReads).toBe(2);
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
            pools: [{ id: poolId }],
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
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.29",
        path: `/v2/lbaas/loadbalancers/${loadBalancerId}`,
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.12",
        path: `/v2/lbaas/listeners/${listenerId}`,
      }),
    );
    const requestedPaths = mocks.openstackRequest.mock.calls.map(
      ([options]) => options.path,
    );
    expect(requestedPaths).not.toContainEqual(
      expect.stringMatching(
        /^\/v2\/lbaas\/(listeners|pools|healthmonitors|l7policies)\?/,
      ),
    );
  });

  describe("pool details", () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const poolId = "22222222-2222-4222-8222-222222222222";
    const listenerId = "33333333-3333-4333-8333-333333333333";
    const monitorId = "44444444-4444-4444-8444-444444444444";
    const memberId = "55555555-5555-4555-8555-555555555555";
    const otherId = "66666666-6666-4666-8666-666666666666";
    const memberPath = `/v2/lbaas/pools/${poolId}/members`;
    const pool = {
      id: poolId,
      project_id: "project-a",
      name: "application",
      loadbalancers: [{ id: parentId }],
      listeners: [{ id: listenerId }],
      healthmonitor_id: monitorId,
    };
    const listener = {
      id: listenerId,
      name: "HTTP",
      project_id: "project-a",
      loadbalancers: [{ id: parentId }],
    };
    const monitor = {
      id: monitorId,
      project_id: "project-a",
      pools: [{ id: poolId }],
    };

    function mockDetails(overrides: Record<string, unknown> = {}) {
      const responses: Record<string, unknown> = {
        [`/v2/lbaas/loadbalancers/${parentId}`]: {
          loadbalancer: loadBalancer(parentId, "project-a", "edge"),
        },
        [`/v2/lbaas/pools/${poolId}`]: { pool },
        [`${memberPath}?limit=100`]: { members: [] },
        [`/v2/lbaas/listeners/${listenerId}`]: { listener },
        [`/v2/lbaas/healthmonitors/${monitorId}`]: { healthmonitor: monitor },
        ...overrides,
      };
      mocks.openstackRequest.mockImplementation(
        async ({ path }: { path: string }) => {
          const response = responses[path];
          if (response instanceof Error) throw response;
          if (response === undefined)
            throw new Error(`Unexpected request: ${path}`);
          return response;
        },
      );
    }

    it("reads only the selected pool topology and keeps members within the pool and project", async () => {
      mockDetails({
        [`${memberPath}?limit=100`]: {
          members: [
            { id: memberId, project_id: "project-a" },
            { id: otherId, project_id: "project-b" },
          ],
          members_links: [
            {
              rel: "next",
              href: `https://octavia.example${memberPath}?marker=${memberId}`,
            },
          ],
        },
        [`${memberPath}?marker=${memberId}`]: {
          members: [{ id: otherId, project_id: "project-a", pool_id: otherId }],
        },
      });
      const details = await getLoadBalancerPoolDetails(
        parentId,
        poolId,
        "RegionOne",
        "project-a",
      );
      expect(details).toMatchObject({
        loadBalancer: { id: parentId },
        pool,
        listeners: [listener],
        members: [{ id: memberId, project_id: "project-a", pool_id: poolId }],
        healthMonitor: monitor,
      });
      expect(mocks.openstackRequest).toHaveBeenCalledTimes(6);
      expect(mocks.discoverLoadBalancerCapabilities).not.toHaveBeenCalled();
    });

    it.each([
      { loadbalancers: [{ id: otherId }] },
      { project_id: "project-b" },
      { id: otherId },
    ])(
      "rejects a pool with an unrelated parent, project or ID: %j",
      async (changes) => {
        mockDetails({
          [`/v2/lbaas/pools/${poolId}`]: { pool: { ...pool, ...changes } },
        });
        await expect(
          getLoadBalancerPoolDetails(parentId, poolId),
        ).rejects.toMatchObject({ status: 404 });
        expect(mocks.openstackRequest).toHaveBeenCalledTimes(2);
      },
    );

    it("rejects another region before making requests", async () => {
      await expect(
        getLoadBalancerPoolDetails(parentId, poolId, "RegionTwo"),
      ).rejects.toThrow("region does not match");
      expect(mocks.openstackRequest).not.toHaveBeenCalled();
    });

    it("distinguishes a missing child resource from an empty pool", async () => {
      const missing = new OpenStackRequestError(404, "Missing");
      mockDetails({
        [`${memberPath}?limit=100`]: missing,
        [`/v2/lbaas/listeners/${listenerId}`]: missing,
        [`/v2/lbaas/healthmonitors/${monitorId}`]: missing,
      });
      await expect(
        getLoadBalancerPoolDetails(parentId, poolId),
      ).resolves.toMatchObject({
        pool,
        listeners: [null],
        members: null,
        healthMonitor: null,
      });
    });

    it("does not follow a member pagination link that points at a different pool", async () => {
      mockDetails({
        [`${memberPath}?limit=100`]: {
          members: [],
          members_links: [
            {
              rel: "next",
              href: `/v2/lbaas/pools/${otherId}/members?marker=${memberId}`,
            },
          ],
        },
      });
      await expect(
        getLoadBalancerPoolDetails(parentId, poolId),
      ).rejects.toThrow("Invalid Octavia members pagination target");
      expect(
        mocks.openstackRequest.mock.calls.map(([options]) => options.path),
      ).not.toContain(`/v2/lbaas/pools/${otherId}/members?marker=${memberId}`);
    });
  });
});
