import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutationErrorForStatus, mutationFailure } from "@/lib/mutations";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getLoadBalancer: vi.fn(),
  getLoadBalancerListener: vi.fn(),
  getLoadBalancerPool: vi.fn(),
  getOctaviaPoolHealthMonitor: vi.fn(),
  getOctaviaPoolMember: vi.fn(),
  guardMutationContext: vi.fn(),
  listOctaviaPoolRedirectPolicies: vi.fn(),
  openstackRequest: vi.fn(),
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
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/openstack/octavia-server", () => ({
  getLoadBalancer: mocks.getLoadBalancer,
  getLoadBalancerDetails: vi.fn(),
  getLoadBalancerListener: mocks.getLoadBalancerListener,
  getLoadBalancerListenerDetails: vi.fn(),
  getLoadBalancerPool: mocks.getLoadBalancerPool,
  getOctaviaPoolHealthMonitor: mocks.getOctaviaPoolHealthMonitor,
  getOctaviaPoolMember: mocks.getOctaviaPoolMember,
  listLoadBalancerAvailabilityZones: vi.fn(),
  listLoadBalancers: vi.fn(),
  listOctaviaPoolRedirectPolicies: mocks.listOctaviaPoolRedirectPolicies,
}));

import {
  createLoadBalancerAction,
  deleteLoadBalancerAction,
  mutateLoadBalancerListenerAction,
  mutateLoadBalancerPoolAction,
  mutateOctaviaHealthMonitorAction,
  mutateOctaviaPoolMemberAction,
  updateLoadBalancerAction,
} from "@/lib/openstack/octavia-actions";
import { OpenStackRequestError } from "@/lib/openstack/request";

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

describe("Octavia health monitor actions", () => {
  const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
  const monitorId = "564c3265-5933-44c7-a8da-3101e2e66a29";
  const pool = { id: poolId, protocol: "HTTP", provisioning_status: "ACTIVE" };
  const settings = {
    type: "HTTP",
    name: "healthz",
    admin_state_up: false,
    delay: 10,
    timeout: 3,
    max_retries: 2,
    max_retries_down: 4,
    http_method: "GET",
    url_path: "/healthz",
    expected_codes: "200-204",
  } as const;
  const monitor = {
    ...settings,
    id: monitorId,
    project_id: scope.projectId,
    provisioning_status: "ACTIVE",
    pools: [{ id: poolId }],
  };
  const create = { action: "create", settings } as const;
  const edit = {
    action: "edit",
    id: monitorId,
    source: settings,
    settings: { ...settings, http_method: "HEAD", expected_codes: "204" },
  } as const;
  const remove = { action: "delete", id: monitorId } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities());
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ pools: [{ id: poolId }], provider: "amphorav2" }),
    );
    mocks.getLoadBalancerPool.mockResolvedValue(pool);
    mocks.getOctaviaPoolHealthMonitor.mockResolvedValue(monitor);
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it("creates a monitor without supplying a project override", async () => {
    await mutateOctaviaHealthMonitorAction(
      scope,
      loadBalancerId,
      poolId,
      create,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2/lbaas/healthmonitors",
        method: "POST",
        scope,
        apiVersion: "load-balancer 2.0",
        body: { healthmonitor: { ...settings, pool_id: poolId } },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ healthmonitor: monitor })).toBeNull();
    expect(() =>
      transform({
        healthmonitor: { ...monitor, pools: [{ id: vipSubnetId }] },
      }),
    ).toThrow();
    expect(() =>
      transform({
        healthmonitor: { ...monitor, project_id: "another-project" },
      }),
    ).toThrow();
  });

  it.each([
    { timeout: 10 },
    { max_retries_down: 11 },
    { expected_codes: "204-200" },
    { expected_codes: "099" },
    { expected_codes: "200,\n204" },
    { url_path: "//example.test/health" },
    { url_path: "/health check" },
    { url_path: "/health%zz" },
  ])(
    "rejects invalid settings before a service call: %j",
    async (overrides) => {
      await expect(
        mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, {
          action: "create",
          settings: { ...settings, ...overrides },
        }),
      ).resolves.toMatchObject({ ok: false });
      expect(mocks.getLoadBalancer).not.toHaveBeenCalled();
    },
  );

  it("scopes pool access and rejects another protocol, a pending pool, or a duplicate", async () => {
    await expect(
      mutateOctaviaHealthMonitorAction(
        scope,
        loadBalancerId,
        vipSubnetId,
        create,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
    for (const overrides of [
      { protocol: "UDP" },
      { protocol: "TCP" },
      { provisioning_status: "PENDING_UPDATE" },
      { healthmonitor_id: monitorId },
    ]) {
      mocks.getLoadBalancerPool.mockResolvedValueOnce({
        ...pool,
        ...overrides,
      });
      await expect(
        mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, create),
      ).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("creates TCP checks without sending HTTP fields", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({ ...pool, protocol: "TCP" });
    const tcp = {
      type: "TCP",
      name: settings.name,
      admin_state_up: false,
      delay: 10,
      timeout: 3,
      max_retries: 2,
      max_retries_down: 4,
    } as const;
    await mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, {
      action: "create",
      settings: tcp,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { healthmonitor: { ...tcp, pool_id: poolId } },
      }),
    );
  });

  it("sends only changed mutable fields for an edit", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      healthmonitor_id: monitorId,
    });
    await mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, edit);
    expect(mocks.getOctaviaPoolHealthMonitor).toHaveBeenCalledWith(
      poolId,
      monitorId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: `/v2/lbaas/healthmonitors/${monitorId}`,
        body: { healthmonitor: { http_method: "HEAD", expected_codes: "204" } },
      }),
    );
  });

  it("rejects writes when snapshot, monitor status or pool link changed", async () => {
    await expect(
      mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, remove),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.getOctaviaPoolHealthMonitor).not.toHaveBeenCalled();
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      healthmonitor_id: monitorId,
    });
    for (const overrides of [
      { delay: 20 },
      { provisioning_status: "PENDING_UPDATE" },
      { pools: [{ id: vipSubnetId }] },
    ]) {
      mocks.getOctaviaPoolHealthMonitor.mockResolvedValueOnce({
        ...monitor,
        ...overrides,
      });
      await expect(
        mutateOctaviaHealthMonitorAction(scope, loadBalancerId, poolId, edit),
      ).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("deletes only the monitor, including one in ERROR", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      healthmonitor_id: monitorId,
    });
    mocks.getOctaviaPoolHealthMonitor.mockResolvedValueOnce({
      ...monitor,
      provisioning_status: "ERROR",
    });
    await mutateOctaviaHealthMonitorAction(
      scope,
      loadBalancerId,
      poolId,
      remove,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: `/v2/lbaas/healthmonitors/${monitorId}`,
      }),
    );
    expect(mocks.executeOpenStackMutation.mock.calls[0][0]).not.toHaveProperty(
      "body",
    );
  });
});

describe("Octavia member actions", () => {
  const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
  const memberId = "564c3265-5933-44c7-a8da-3101e2e66a29";
  const pool = {
    id: poolId,
    protocol: "HTTP",
    provisioning_status: "ACTIVE",
    members: [{ id: memberId }],
  };
  const member = {
    id: memberId,
    name: "backend",
    weight: 1,
    admin_state_up: false,
    provisioning_status: "ACTIVE",
  };
  const current = { name: member.name, adminStateUp: false, weight: 1 };
  const create = {
    action: "create",
    ...current,
    address: "10.10.0.20",
    port: 8080,
  } as const;
  const edit = {
    action: "edit",
    id: memberId,
    ...current,
    source: current,
    weight: 0,
  } as const;
  const remove = { action: "delete", id: memberId } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities());
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({ pools: [{ id: poolId }], provider: "amphorav2" }),
    );
    mocks.getLoadBalancerPool.mockResolvedValue(pool);
    mocks.getOctaviaPoolMember.mockResolvedValue(member);
    mocks.openstackRequest.mockResolvedValue({ subnet: { id: vipSubnetId } });
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it("creates a member on the VIP subnet by default", async () => {
    await mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, create);
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "POST",
        path: `/v2/lbaas/pools/${poolId}/members`,
        apiVersion: "load-balancer 2.0",
        body: {
          member: {
            name: "backend",
            admin_state_up: false,
            address: "10.10.0.20",
            protocol_port: 8080,
            weight: 1,
          },
        },
      }),
    );
  });

  it("validates subnet visibility before adding an IPv6 member and allows routed addresses", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({ ...pool, protocol: "UDP" });
    await mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, {
      ...create,
      address: "2001:db8::20",
      subnetId: vipSubnetId,
    });
    expect(mocks.openstackRequest).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        path: `/v2.0/subnets/${vipSubnetId}`,
        regionId: scope.regionId,
        serviceType: "network",
        errorMode: "throw",
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.1",
        body: {
          member: expect.objectContaining({
            address: "2001:db8::20",
            subnet_id: vipSubnetId,
          }),
        },
      }),
    );
  });

  it("does not add a member on an unavailable subnet", async () => {
    mocks.openstackRequest.mockRejectedValueOnce({
      name: "OpenStackRequestError",
      status: 403,
    });
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, {
        ...create,
        subnetId: vipSubnetId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { status: 403 } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([
    { address: "10.10.0.20/24" },
    { address: "2001:db8::2]#" },
    { port: 0 },
    { port: 65536 },
    { weight: -1 },
    { weight: 257 },
  ])("rejects invalid member inputs (%o)", async (changes) => {
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, {
        ...create,
        ...changes,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not mutate unlisted pools or members", async () => {
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, vipSubnetId, create),
    ).resolves.toMatchObject({ ok: false, error: { status: 404 } });
    expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, {
        ...remove,
        id: vipSubnetId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { status: 404 } });
    expect(mocks.getOctaviaPoolMember).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("updates only changed mutable fields, including zero weight", async () => {
    await mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, edit);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "PUT",
        path: `/v2/lbaas/pools/${poolId}/members/${memberId}`,
        body: { member: { weight: 0 } },
      }),
    );
  });

  it.each([3, undefined])(
    "blocks a stale or missing weight (%s)",
    async (weight) => {
      mocks.getOctaviaPoolMember.mockResolvedValue({ ...member, weight });
      await expect(
        mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, edit),
      ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("does not mutate a pending pool or member", async () => {
    mocks.getLoadBalancerPool.mockResolvedValueOnce({
      ...pool,
      provisioning_status: "PENDING_UPDATE",
    });
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, create),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    mocks.getOctaviaPoolMember.mockResolvedValue({
      ...member,
      provisioning_status: "PENDING_DELETE",
    });
    await expect(
      mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, remove),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("removes the member through the scoped nested endpoint and not the pool", async () => {
    await mutateOctaviaPoolMemberAction(scope, loadBalancerId, poolId, remove);
    expect(mocks.getOctaviaPoolMember).toHaveBeenCalledExactlyOnceWith(
      poolId,
      memberId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "DELETE",
        path: `/v2/lbaas/pools/${poolId}/members/${memberId}`,
      }),
    );
  });
});

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
    mocks.listOctaviaPoolRedirectPolicies.mockResolvedValue([]);
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

  const appCookie = {
    type: "APP_COOKIE",
    cookie_name: "app_session-id",
    persistence_timeout: null,
    persistence_granularity: null,
  } as const;

  it.each([
    {
      protocol: "HTTP",
      persistence: { type: "HTTP_COOKIE" },
      apiVersion: "2.0",
    },
    {
      protocol: "HTTP",
      persistence: { type: "APP_COOKIE", cookie_name: appCookie.cookie_name },
      apiVersion: "2.0",
    },
    { protocol: "TCP", persistence: { type: "SOURCE_IP" }, apiVersion: "2.0" },
    {
      protocol: "HTTPS",
      persistence: { type: "SOURCE_IP" },
      apiVersion: "2.0",
    },
    { protocol: "UDP", persistence: { type: "SOURCE_IP" }, apiVersion: "2.1" },
  ] as const)(
    "creates a $protocol pool with $persistence.type",
    async ({ protocol, persistence, apiVersion }) => {
      await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...create,
        protocol,
        persistence,
      });
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          method: "POST",
          apiVersion: `load-balancer ${apiVersion}`,
          body: {
            pool: expect.objectContaining({ session_persistence: persistence }),
          },
        }),
      );
    },
  );

  it.each([
    { protocol: "UDP", persistence: { type: "HTTP_COOKIE" } },
    {
      protocol: "TCP",
      persistence: { type: "APP_COOKIE", cookie_name: "session" },
    },
    { protocol: "HTTPS", persistence: { type: "HTTP_COOKIE" } },
    {
      protocol: "HTTP",
      persistence: { type: "HTTP_COOKIE", cookie_name: "session" },
    },
    { protocol: "HTTP", persistence: { type: "APP_COOKIE" } },
    {
      protocol: "HTTP",
      persistence: { type: "APP_COOKIE", cookie_name: "bad name" },
    },
    {
      protocol: "HTTP",
      persistence: { type: "APP_COOKIE", cookie_name: "session\n" },
    },
    {
      protocol: "HTTP",
      persistence: { type: "APP_COOKIE", cookie_name: "a".repeat(256) },
    },
  ] as const)("rejects invalid persistence at creation (%o)", async (input) => {
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...create,
        ...input,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([
    [null, { type: "HTTP_COOKIE" }, { type: "HTTP_COOKIE" }],
    [
      appCookie,
      { type: "APP_COOKIE", cookie_name: "renamed_session" },
      { type: "APP_COOKIE", cookie_name: "renamed_session" },
    ],
    [
      appCookie,
      { type: "SOURCE_IP" },
      { type: "SOURCE_IP", cookie_name: null },
    ],
    [appCookie, null, null],
  ] as const)(
    "updates only session persistence from %o to %o",
    async (before, after, expected) => {
      mocks.getLoadBalancerPool.mockResolvedValue({
        ...pool,
        session_persistence: before ?? undefined,
      });
      await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...edit,
        persistence: { before, after },
      });
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          method: "PUT",
          body: { pool: { session_persistence: expected } },
        }),
      );
    },
  );

  it("validates edit persistence against the fresh pool protocol", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({ ...pool, protocol: "UDP" });
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...edit,
        persistence: { before: null, after: { type: "HTTP_COOKIE" } },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  const customSource = {
    type: "SOURCE_IP",
    cookie_name: null,
    persistence_timeout: 360,
    persistence_granularity: "255.255.255.0",
  } as const;

  it.each([
    { ...appCookie, cookie_name: "changed_cookie" },
    { ...customSource, persistence_timeout: 180 },
    { type: "SOURCE_IP", persistence_timeout: "invalid" },
  ])(
    "rejects a stale or unverified persistence snapshot (%o)",
    async (session_persistence) => {
      const before =
        session_persistence.type === "APP_COOKIE" ? appCookie : customSource;
      mocks.getLoadBalancerPool.mockResolvedValue({
        ...pool,
        session_persistence,
      });
      await expect(
        mutateLoadBalancerPoolAction(scope, loadBalancerId, {
          ...edit,
          persistence: { before, after: null },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("leaves provider-specific UDP SOURCE_IP settings untouched when the mode is unchanged", async () => {
    mocks.getLoadBalancerPool.mockResolvedValue({
      ...pool,
      protocol: "UDP",
      session_persistence: customSource,
    });
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, {
        ...edit,
        persistence: { before: customSource, after: { type: "SOURCE_IP" } },
      }),
    ).resolves.toMatchObject({ ok: true, status: "success" });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    await mutateLoadBalancerPoolAction(scope, loadBalancerId, {
      ...edit,
      name: "renamed",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ body: { pool: { name: "renamed" } } }),
    );
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
    expect(mocks.listOctaviaPoolRedirectPolicies).toHaveBeenCalledWith(
      poolId,
      scope.regionId,
      scope.projectId,
    );
  });

  it("blocks deletion if a fresh read finds a disabled L7 redirect to the pool", async () => {
    mocks.listOctaviaPoolRedirectPolicies.mockResolvedValue([
      {
        redirect_pool_id: poolId,
        admin_state_up: false,
        rules: [],
      },
    ]);
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, remove),
    ).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("L7 policies") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not delete the pool if L7 dependencies cannot be checked", async () => {
    mocks.listOctaviaPoolRedirectPolicies.mockRejectedValue(
      new Error("unavailable"),
    );
    await expect(
      mutateLoadBalancerPoolAction(scope, loadBalancerId, remove),
    ).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("L7 policy dependencies") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});

describe("Octavia listener actions", () => {
  const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
  const previousPoolId = "564c3265-5933-44c7-a8da-3101e2e66a29";
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
        pools: [{ id: poolId }, { id: previousPoolId }],
        provider: "amphorav2",
        vip_address: "192.0.2.10",
      }),
    );
    mocks.getLoadBalancerListener.mockResolvedValue(listener);
    mocks.getLoadBalancerPool.mockResolvedValue({
      id: poolId,
      protocol: "TCP",
      provisioning_status: "ACTIVE",
    });
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it.each([
    [null, poolId],
    [previousPoolId, poolId],
    [previousPoolId, null],
  ])(
    "changes only the listener default pool from %s to %s",
    async (before, after) => {
      mocks.getLoadBalancerListener.mockResolvedValue({
        ...listener,
        default_pool_id: before,
      });
      await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...edit,
        name: current.name,
        defaultPool: { before, after },
      });
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          method: "PUT",
          path: `/v2/lbaas/listeners/${listenerId}`,
          apiVersion: "load-balancer 2.0",
          body: { listener: { default_pool_id: after } },
          successMessage: "Default pool change requested.",
        }),
      );
      if (after) {
        expect(mocks.getLoadBalancerPool).toHaveBeenCalledWith(
          loadBalancerId,
          after,
          scope.regionId,
          scope.projectId,
        );
      } else {
        expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
      }
    },
  );

  it.each([undefined, previousPoolId])(
    "rejects a stale or unreported default pool (%s)",
    async (actual) => {
      mocks.getLoadBalancerListener.mockResolvedValue({
        ...listener,
        default_pool_id: actual,
      });
      await expect(
        mutateLoadBalancerListenerAction(scope, loadBalancerId, {
          ...edit,
          defaultPool: { before: null, after: poolId },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("does not look up a pool outside the scoped load balancer", async () => {
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...edit,
        defaultPool: { before: null, after: vipSubnetId },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.getLoadBalancerPool).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([
    { protocol: "UDP", provisioning_status: "ACTIVE" },
    { protocol: "TCP", provisioning_status: "ERROR" },
    { protocol: "TCP", provisioning_status: "PENDING_DELETE" },
  ])("rejects an incompatible or non-Active pool (%o)", async (pool) => {
    mocks.getLoadBalancerPool.mockResolvedValue(pool);
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...edit,
        defaultPool: { before: null, after: poolId },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not let the default pool edit bypass provider support", async () => {
    mocks.getLoadBalancer.mockResolvedValue(
      existingLoadBalancer({
        listeners: [{ id: listenerId }],
        provider: "ovn",
      }),
    );
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      default_pool_id: previousPoolId,
    });
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...edit,
        defaultPool: { before: previousPoolId, after: null },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not write a default pool for unrelated listener edits", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      default_pool_id: undefined,
    });
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, edit);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ body: { listener: { name: edit.name } } }),
    );
  });

  it("allows an unnamed listener to change pools without rewriting its name", async () => {
    mocks.getLoadBalancerListener.mockResolvedValue({
      ...listener,
      name: null,
    });
    await mutateLoadBalancerListenerAction(scope, loadBalancerId, {
      ...edit,
      name: "",
      source: { ...current, name: "" },
      defaultPool: { before: null, after: poolId },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        body: { listener: { default_pool_id: poolId } },
      }),
    );
  });

  it("does not update the listener if the chosen pool disappears", async () => {
    mocks.getLoadBalancerPool.mockRejectedValueOnce({
      name: "OpenStackRequestError",
      status: 404,
    });
    await expect(
      mutateLoadBalancerListenerAction(scope, loadBalancerId, {
        ...edit,
        defaultPool: { before: null, after: poolId },
      }),
    ).resolves.toMatchObject({ ok: false, error: { status: 404 } });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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
  const fixedVip = { name: "fixed-vip", vipSubnetId, vipAddress: "10.0.0.72" };
  const visibleSubnet = { id: vipSubnetId, cidr: "10.0.0.0/25", ip_version: 4 };

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
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("requests the fixed IPv4 VIP on the freshly verified subnet using the baseline API", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({ subnet: visibleSubnet });
    await expect(
      createLoadBalancerAction(scope, {
        ...fixedVip,
        vipAddress: " 10.0.0.72 ",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.openstackRequest).toHaveBeenCalledExactlyOnceWith({
      regionId: scope.regionId,
      serviceType: "network",
      serviceName: "neutron",
      path: `/v2.0/subnets/${vipSubnetId}`,
      errorMode: "throw",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        apiVersion: "load-balancer 2.0",
        body: {
          loadbalancer: expect.objectContaining({
            vip_address: fixedVip.vipAddress,
            vip_subnet_id: vipSubnetId,
          }),
        },
      }),
    );
    const [{ transform }] = mocks.executeOpenStackMutation.mock.calls[0];
    const result = existingLoadBalancer({
      vip_address: fixedVip.vipAddress,
      vip_subnet_id: vipSubnetId,
    });
    expect(transform({ loadbalancer: result })).toBe(result);
    expect(() =>
      transform({ loadbalancer: { ...result, vip_address: "10.0.0.73" } }),
    ).toThrow("requested fixed VIP");
    expect(() =>
      transform({ loadbalancer: { ...result, vip_subnet_id: loadBalancerId } }),
    ).toThrow("requested fixed VIP");
  });

  it.each(["10.0.0.72/32", "2001:db8::72", "10.0.0.999", ""])(
    "rejects a malformed or non-IPv4 fixed VIP without sending a request: %s",
    async (vipAddress) => {
      await expect(
        createLoadBalancerAction(scope, { ...fixedVip, vipAddress }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "validation-failed" },
      });
      expect(mocks.openstackRequest).not.toHaveBeenCalled();
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["wrong range", { subnet: { ...visibleSubnet, cidr: "10.0.0.128/25" } }],
    [
      "IPv6 subnet",
      { subnet: { ...visibleSubnet, cidr: "2001:db8::/64", ip_version: 6 } },
    ],
    ["wrong subnet", { subnet: { ...visibleSubnet, id: loadBalancerId } }],
    ["malformed subnet", { subnet: { id: vipSubnetId, cidr: null } }],
    ["missing subnet", null],
  ])("does not create a fixed VIP for %s", async (_label, response) => {
    mocks.openstackRequest.mockResolvedValueOnce(response);
    await expect(
      createLoadBalancerAction(scope, fixedVip),
    ).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not create a fixed VIP when Neutron denies subnet access", async () => {
    mocks.openstackRequest.mockRejectedValueOnce(
      new OpenStackRequestError(403, "Forbidden"),
    );
    await expect(
      createLoadBalancerAction(scope, fixedVip),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("preserves the session refresh redirect during fixed VIP preflight", async () => {
    mocks.openstackRequest.mockImplementationOnce(() =>
      redirect("/auth/refresh"),
    );
    await expect(
      createLoadBalancerAction(scope, fixedVip),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(";/auth/refresh;"),
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([409, 500])(
    "explains a fixed VIP create failure (%d) when an exact assignment is visible",
    async (status) => {
      const failure = mutationFailure(
        mutationErrorForStatus(status, "create a load balancer", "req-create"),
        scope,
      );
      mocks.executeOpenStackMutation.mockResolvedValueOnce(failure);
      mocks.openstackRequest
        .mockResolvedValueOnce({ subnet: visibleSubnet })
        .mockResolvedValueOnce({
          loadbalancers: [
            {
              project_id: scope.projectId.replaceAll("-", ""),
              vip_subnet_id: vipSubnetId,
              vip_address: fixedVip.vipAddress,
            },
          ],
        });
      await expect(
        createLoadBalancerAction(scope, fixedVip),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          status,
          requestId: "req-create",
          message: expect.stringContaining("already assigned"),
        },
      });
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
      const lookup = mocks.openstackRequest.mock.lastCall?.[0];
      expect(lookup).toMatchObject({
        regionId: scope.regionId,
        serviceName: "octavia",
      });
      expect(
        new URLSearchParams(lookup.path.split("?")[1]).get("project_id"),
      ).toBe(scope.projectId.replaceAll("-", ""));
    },
  );

  it.each([
    { project_id: "foreign-project" },
    { vip_subnet_id: loadBalancerId },
    { vip_address: "10.0.0.73" },
  ])(
    "keeps the original error on nonmatching assignment lookup %j",
    async (other) => {
      const failure = mutationFailure(
        mutationErrorForStatus(500, "create a load balancer"),
        scope,
      );
      mocks.executeOpenStackMutation.mockResolvedValueOnce(failure);
      mocks.openstackRequest
        .mockResolvedValueOnce({ subnet: visibleSubnet })
        .mockResolvedValueOnce({
          loadbalancers: [
            {
              project_id: scope.projectId,
              vip_subnet_id: vipSubnetId,
              vip_address: fixedVip.vipAddress,
              ...other,
            },
          ],
        });
      await expect(createLoadBalancerAction(scope, fixedVip)).resolves.toEqual(
        failure,
      );
    },
  );

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
