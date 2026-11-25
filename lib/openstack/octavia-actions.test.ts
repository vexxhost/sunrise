import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getLoadBalancer: vi.fn(),
  getLoadBalancerListener: vi.fn(),
  getLoadBalancerPool: vi.fn(),
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
  getLoadBalancerListener: mocks.getLoadBalancerListener,
  getLoadBalancerListenerDetails: vi.fn(),
  getLoadBalancerPool: mocks.getLoadBalancerPool,
  listLoadBalancerAvailabilityZones: vi.fn(),
  listLoadBalancers: vi.fn(),
}));

import {
  createLoadBalancerAction,
  deleteLoadBalancerAction,
  mutateLoadBalancerListenerAction,
  mutateLoadBalancerPoolAction,
  updateLoadBalancerAction,
} from "@/lib/openstack/octavia-actions";

const scope = {
  projectId: "297c1aa4-ef4f-42bf-9fdb-6a7c6ced78b2",
  regionId: "RegionOne",
};
const vipSubnetId = "2217ca4f-3722-40ae-88cc-20fb92f21395";
const loadBalancerId = "4ed3f70c-5126-470d-be60-3710d8682220";
const listenerId = "620630da-7cc9-45a3-97bc-f519aaa46066";

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

describe("Octavia pool actions", () => {
  const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
  const fields = {
    name: "backend",
    description: "",
    adminStateUp: false,
    algorithm: "ROUND_ROBIN",
  } as const;
  const create = { ...fields, action: "create", protocol: "HTTP" } as const;
  const edit = {
    ...fields,
    action: "edit",
    id: poolId,
    source: fields,
  } as const;
  const remove = {
    action: "delete",
    id: poolId,
    listenerIds: [] as string[],
  } as const;
  const pool = {
    id: poolId,
    name: fields.name,
    description: null,
    lb_algorithm: fields.algorithm,
    admin_state_up: fields.adminStateUp,
    protocol: "HTTP",
    provisioning_status: "ACTIVE",
    members: [],
    listeners: [],
    healthmonitor_id: null,
  };
  const listener = {
    provisioning_status: "ACTIVE",
    default_pool_id: null,
    protocol: "HTTP",
  };
  const parent = {
    pools: [{ id: poolId }],
    listeners: [{ id: listenerId }],
    provider: "amphorav2",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities());
    mocks.getLoadBalancer.mockResolvedValue(existingLoadBalancer(parent));
    mocks.getLoadBalancerListener.mockResolvedValue(listener);
    mocks.getLoadBalancerPool.mockResolvedValue(pool);
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it.each([
    ["HTTP", "load-balancer 2.0"],
    ["TCP", "load-balancer 2.0"],
    ["HTTPS", "load-balancer 2.0"],
    ["UDP", "load-balancer 2.1"],
  ] as const)("creates a standalone %s pool", async (protocol, apiVersion) => {
    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...create,
      protocol,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/v2/lbaas/pools",
        apiVersion,
        body: {
          pool: {
            loadbalancer_id: loadBalancerId,
            name: fields.name,
            description: "",
            admin_state_up: false,
            lb_algorithm: fields.algorithm,
            protocol,
          },
        },
      }),
    );
  });

  it("attaches a new pool by listener ID only", async () => {
    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...create,
      listenerId,
    });
    expect(mocks.getLoadBalancerListener).toHaveBeenCalledWith(
      loadBalancerId,
      listenerId,
      scope.regionId,
      scope.projectId,
    );
    const [{ body }] = mocks.executeOpenStackMutation.mock.calls[0];
    expect(body.pool.listener_id).toBe(listenerId);
    expect(body.pool).not.toHaveProperty("loadbalancer_id");
  });

  it.each([
    { ...listener, default_pool_id: poolId },
    { ...listener, default_pool_id: undefined },
    { ...listener, provisioning_status: "PENDING_UPDATE" },
    { ...listener, protocol: "UDP" },
    { ...listener, protocol: undefined },
  ])("refuses an ineligible listener: %o", async (current) => {
    mocks.getLoadBalancerListener.mockResolvedValue(current);
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...create,
        listenerId,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects a listener or pool not listed on the scoped parent", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ provider: parent.provider }),
    );
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...create,
        listenerId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { status: 404 } });
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, remove),
    ).resolves.toMatchObject({ ok: false, error: { status: 404 } });
    expect(mocks.getLoadBalancerListener).not.toHaveBeenCalled();
    expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("blocks writes for an unverified provider and UDP on an older API", async () => {
    mocks.getLoadBalancer.mockResolvedValueOnce(
      existingLoadBalancer({ ...parent, provider: "ovn" }),
    );
    expect(
      await mutateLoadBalancerPoolAction(scope, loadBalancerId, create),
    ).toMatchObject({ ok: false });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValueOnce(
      capabilities("2.0"),
    );
    expect(
      await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...create,
        protocol: "UDP",
      }),
    ).toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("patches only changed fields and rejects stale editing snapshots", async () => {
    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...edit,
      algorithm: "SOURCE_IP",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: `/v2/lbaas/pools/${poolId}`,
        body: { pool: { lb_algorithm: "SOURCE_IP" } },
      }),
    );
    mocks.executeOpenStackMutation.mockClear();
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      lb_algorithm: "LEAST_CONNECTIONS",
    });
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...edit,
        algorithm: "SOURCE_IP",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("edits an unnamed pool without overwriting an existing algorithm", async () => {
    const source = { ...fields, name: "", algorithm: "CUSTOM" };
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      name: null,
      lb_algorithm: source.algorithm,
    });
    const request = { ...edit, ...source, source };
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, request),
    ).resolves.toMatchObject({ ok: true, status: "success" });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();

    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...request,
      name: "backend",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { pool: { name: "backend" } } }),
    );
  });

  it.each([
    { members: [{ id: listenerId }] },
    { healthmonitor_id: listenerId },
    { members: undefined },
    { listeners: undefined },
    { listeners: [{ id: listenerId }] },
    { provisioning_status: "PENDING_UPDATE" },
  ])(
    "blocks deletion when a dependency or pending change exists: %o",
    async (changes) => {
      mocks.getLoadBalancerPool.mockResolvedValue({ ...pool, ...changes });
      await expect(
        mutateLoadBalancerPoolAction(scope, loadBalancerId, remove),
      ).resolves.toMatchObject({ ok: false });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("deletes an empty pool with its acknowledged listener attachment", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      healthmonitor_id: undefined,
      listeners: [{ id: listenerId }],
    });
    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...remove,
      listenerIds: [listenerId],
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: `/v2/lbaas/pools/${poolId}`,
      }),
    );
  });
});

describe("Octavia listener actions", () => {
  const current = { name: "http", description: "", adminStateUp: true };
  const create = {
    ...current,
    action: "create",
    port: 8080,
    protocol: "HTTP",
  } as const;
  const edit = {
    ...current,
    action: "edit",
    id: listenerId,
    name: "renamed",
    source: current,
  } as const;
  const remove = { action: "delete", id: listenerId } as const;
  const listener = {
    id: listenerId,
    project_id: scope.projectId.replaceAll("-", ""),
    loadbalancers: [{ id: loadBalancerId }],
    name: current.name,
    description: null,
    admin_state_up: true,
    provisioning_status: "ACTIVE",
    default_pool_id: null,
    l7policies: [],
    protocol: "HTTPS",
    allowed_cidrs: ["192.0.2.0/24"],
    timeout_client_data: 50_000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "project-token", scope },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities());
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({
        listeners: [{ id: listenerId }],
        provider: "amphorav2",
        vip_address: "192.0.2.10",
      }),
    );
    mocks.getLoadBalancerListener.mockResolvedValue(listener);
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it.each(["HTTP", "TCP", "HTTPS", "UDP"] as const)(
    "creates an owned %s listener",
    async (protocol) => {
      await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...create,
        protocol,
      });
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/v2/lbaas/listeners",
          apiVersion:
            protocol === "UDP" ? "load-balancer 2.1" : "load-balancer 2.0",
          body: {
            listener: {
              name: "http",
              description: "",
              admin_state_up: true,
              protocol,
              protocol_port: 8080,
              loadbalancer_id: loadBalancerId,
            },
          },
        }),
      );
    },
  );

  it.each([0, 65536, 80.5])(
    "rejects invalid port %s before accessing Octavia",
    async (port) => {
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, {
          ...create,
          port,
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "validation-failed" },
      });
      expect(mocks.getLoadBalancer).not.toHaveBeenCalled();
    },
  );

  it("blocks writes when the parent is not active", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ provisioning_status: "PENDING_UPDATE" }),
    );
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, create),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects a listener missing from the selected load balancer even in the same project", async () => {
    mocks.getLoadBalancer.mockResolvedValue(existingLoadBalancer());
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, edit),
    ).resolves.toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(mocks.getLoadBalancerListener).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("sends only changed fields and verifies the returned listener's identity and scope", async () => {
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, edit);
    expect(mocks.getLoadBalancerListener).toHaveBeenCalledWith(
      loadBalancerId,
      listenerId,
      scope.regionId,
      scope.projectId,
      undefined,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/v2/lbaas/listeners/" + listenerId,
        body: { listener: { name: "renamed" } },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ listener })).toBeNull();
    for (const changes of [
      { id: vipSubnetId },
      { project_id: "different-project" },
      { loadbalancers: [{ id: vipSubnetId }] },
    ]) {
      expect(() =>
        transform({ listener: { ...listener, ...changes } }),
      ).toThrow("invalid listener");
    }
  });

  it("rejects an edit whose source changed", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      admin_state_up: false,
    });
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, edit),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("changes only selected inserted headers and preserves fresh unmanaged values", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      protocol: "TERMINATED_HTTPS",
      insert_headers: {
        "X-Forwarded-For": "true",
        "X-Forwarded-Port": "false",
        "X-SSL-Client-Verify": "true",
      },
    });
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...edit,
      name: current.name,
      insertHeaders: {
        "X-Forwarded-For": { before: "true", enabled: false },
        "X-Forwarded-Proto": { before: null, enabled: true },
      },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.1",
        body: {
          listener: {
            insert_headers: {
              "X-Forwarded-Port": "false",
              "X-Forwarded-Proto": "True",
              "X-SSL-Client-Verify": "true",
            },
          },
        },
      }),
    );
  });

  it("uses Horizon-compatible values for all enabled forwarded headers", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      protocol: "HTTP",
      insert_headers: {},
    });
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...edit,
      name: current.name,
      insertHeaders: {
        "X-Forwarded-For": { before: null, enabled: true },
        "X-Forwarded-Proto": { before: null, enabled: true },
        "X-Forwarded-Port": { before: null, enabled: true },
      },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          listener: {
            insert_headers: {
              "X-Forwarded-For": "True",
              "X-Forwarded-Proto": "True",
              "X-Forwarded-Port": "True",
            },
          },
        },
      }),
    );
  });

  it("clears the last forwarded header without sending other settings", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      protocol: "HTTP",
      insert_headers: { "X-Forwarded-For": "true" },
    });
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...edit,
      name: current.name,
      insertHeaders: { "X-Forwarded-For": { before: "true", enabled: false } },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.0",
        body: { listener: { insert_headers: {} } },
      }),
    );
  });

  it.each([undefined, [], { "X-Forwarded-For": "true" }])(
    "does not overwrite unknown or stale header state: %j",
    async (insert_headers) => {
      mocks.getLoadBalancerListener.mockResolvedValue({
        ...listener,
        protocol: "HTTP",
        insert_headers,
      });
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, {
          ...edit,
          insertHeaders: { "X-Forwarded-For": { before: null, enabled: true } },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it.each([
    { provider: "amphorav2", protocol: "HTTPS", ceiling: "2.28" },
    { provider: "ovn", protocol: "HTTP", ceiling: "2.28" },
    { provider: "amphorav2", protocol: "HTTP", ceiling: "2.0" },
  ])(
    "rejects unsupported forwarded protocol changes: %j",
    async ({ provider, protocol, ceiling }) => {
      mocks.getLoadBalancer.mockResolvedValue(
        existingLoadBalancer({ provider, listeners: [{ id: listenerId }] }),
      );
      mocks.getLoadBalancerListener.mockResolvedValue({
        ...listener,
        protocol,
        insert_headers: null,
      });
      mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
        ...capabilities(),
        configuredMicroversionMaximum: ceiling,
      });
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, {
          ...edit,
          insertHeaders: {
            "X-Forwarded-Proto": { before: null, enabled: true },
          },
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "validation-failed" },
      });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("writes the minimum required API version and does not send defaulted fields", async () => {
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...create,
      settings: {
        connection_limit: -1,
        timeout_tcp_inspect: 0,
        timeout_member_connect: null,
        allowed_cidrs: ["192.0.2.0/24"],
      },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.12",
        body: {
          listener: expect.objectContaining({
            connection_limit: -1,
            timeout_tcp_inspect: 0,
            allowed_cidrs: ["192.0.2.0/24"],
          }),
        },
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body.listener,
    ).not.toHaveProperty("timeout_member_connect");
  });

  it("distinguishes an explicit reset and allowlist removal from an omitted field", async () => {
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...edit,
      name: current.name,
      settings: { allowed_cidrs: [], timeout_client_data: null },
      source: {
        ...current,
        settings: {
          allowed_cidrs: ["192.0.2.0/24"],
          timeout_client_data: 50_000,
        },
      },
    });
    expect(mocks.getLoadBalancerListener).toHaveBeenCalledWith(
      loadBalancerId,
      listenerId,
      scope.regionId,
      scope.projectId,
      "load-balancer 2.12",
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.12",
        body: { listener: { allowed_cidrs: [], timeout_client_data: null } },
      }),
    );
  });

  it("refuses to overwrite versioned settings with a stale or missing source", async () => {
    for (const settings of [undefined, { timeout_client_data: 42_000 }]) {
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, {
          ...edit,
          settings: { timeout_client_data: 30_000 },
          source: { ...current, settings },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects timeouts on UDP and CIDRs beyond the configured API ceiling", async () => {
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...create,
        protocol: "UDP",
        settings: { timeout_member_data: 1000 },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("not available for this protocol"),
      },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      ...capabilities(),
      configuredMicroversionMaximum: "2.11",
    });
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...create,
        settings: { allowed_cidrs: ["192.0.2.0/24"] },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("2.12"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([
    { default_pool_id: vipSubnetId },
    { default_pool_id: undefined },
    { l7policies: [{ id: vipSubnetId }] },
    { l7policies: undefined },
  ])(
    "refuses deletion with attached or unknown topology: %j",
    async (fields) => {
      mocks.getLoadBalancerListener.mockResolvedValue({
        ...listener,
        ...fields,
      });
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, remove),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "validation-failed" },
      });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("deletes an unattached listener without a cascade request", async () => {
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, remove);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/v2/lbaas/listeners/" + listenerId,
      }),
    );
    expect(mocks.executeOpenStackMutation.mock.calls[0][0]).not.toHaveProperty(
      "body",
    );
  });
});

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
