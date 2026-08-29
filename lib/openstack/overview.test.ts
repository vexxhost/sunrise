import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/openstack/catalog", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/openstack/catalog")>();
  return {
    ...original,
    getServiceCatalog: mocks.getServiceCatalog,
  };
});

import { loadProjectOverview } from "@/lib/openstack/overview";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";

const catalog: OpenStackCatalogService[] = [
  {
    name: "nova",
    type: "compute",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://nova.example.test/v2.1",
      },
    ],
  },
  {
    name: "cinder",
    type: "volumev3",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://cinder.example.test/v3/project-id/",
      },
    ],
  },
  {
    name: "neutron",
    type: "network",
    endpoints: [
      {
        interface: "public",
        region_id: "RegionOne",
        url: "https://neutron.example.test/",
      },
    ],
  },
  {
    name: "manilav2",
    type: "sharev2",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://manila.example.test/v2",
      },
    ],
  },
  {
    name: "magnum",
    type: "container-infra",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://magnum.example.test/v1",
      },
    ],
  },
  {
    name: "octavia",
    type: "load-balancer",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://octavia.example.test/",
      },
    ],
  },
];

const successfulPayloads: Record<string, unknown> = {
  "https://nova.example.test/v2.1/os-quota-sets/project-id/detail": {
    quota_set: {
      instances: { in_use: 2, limit: 10, reserved: 0 },
      cores: { in_use: 4, limit: 20, reserved: 1 },
      ram: { in_use: 8192, limit: 51200, reserved: 1024 },
      server_groups: { in_use: 1, limit: 10, reserved: 0 },
      server_group_members: { in_use: 0, limit: 10, reserved: 0 },
      key_pairs: { in_use: 0, limit: 100, reserved: 0 },
      metadata_items: { in_use: 0, limit: 128, reserved: 0 },
    },
  },
  "https://cinder.example.test/v3/project-id/os-quota-sets/project-id?usage=true":
    {
      quota_set: {
        volumes: { in_use: 1, limit: 10, reserved: 0 },
        snapshots: { in_use: 0, limit: 10, reserved: 0 },
        gigabytes: { in_use: 20, limit: 1000, reserved: 0 },
        backups: { in_use: 0, limit: 10, reserved: 0 },
        backup_gigabytes: { in_use: 0, limit: 1000, reserved: 0 },
        groups: { in_use: 0, limit: 10, reserved: 0 },
      },
    },
  "https://neutron.example.test/v2.0/quotas/project-id/details.json": {
    quota: {
      network: { used: 1, limit: 100, reserved: 0 },
      port: { used: 8, limit: 500, reserved: 1 },
      router: { used: 1, limit: 10, reserved: 0 },
      floatingip: { used: 1, limit: 50, reserved: 0 },
      security_group: { used: 4, limit: 10, reserved: 0 },
      security_group_rule: { used: 26, limit: 100, reserved: 0 },
    },
  },
  "https://manila.example.test/v2/project-id/quota-sets/project-id/detail": {
    quota_set: {
      shares: { in_use: 1, limit: 50, reserved: 0 },
      gigabytes: { in_use: 20, limit: 1000, reserved: 0 },
      snapshots: { in_use: 0, limit: 50, reserved: 0 },
      snapshot_gigabytes: { in_use: 0, limit: 1000, reserved: 0 },
      share_networks: { in_use: 1, limit: 10, reserved: 0 },
    },
  },
  "https://magnum.example.test/v1/quotas/project-id/Cluster": {
    resource: "Cluster",
    hard_limit: 20,
  },
  "https://magnum.example.test/v1/stats?project_id=project-id": {
    clusters: 3,
    nodes: 8,
  },
  "https://octavia.example.test/v2/lbaas/quotas/project-id": {
    quota: {
      load_balancer: 5,
      listener: null,
      pool: null,
      member: null,
      health_monitor: null,
      l7policy: null,
      l7rule: null,
    },
  },
  "https://octavia.example.test/v2/lbaas/quotas/defaults": {
    quota: {
      load_balancer: -1,
      listener: -1,
      pool: -1,
      member: -1,
      health_monitor: -1,
      l7policy: -1,
      l7rule: -1,
    },
  },
  "https://octavia.example.test/v2/lbaas/loadbalancers?limit=100&project_id=project-id":
    {
      loadbalancers: [{ id: "lb-1" }],
    },
  "https://octavia.example.test/v2/lbaas/listeners?limit=100&project_id=project-id":
    {
      listeners: [{ id: "listener-1" }, { id: "listener-2" }],
    },
  "https://octavia.example.test/v2/lbaas/pools?limit=100&project_id=project-id":
    {
      pools: [
        { id: "pool-1", members: [{ id: "member-1" }, { id: "member-2" }] },
        { id: "pool-2", members: [{ id: "member-3" }] },
      ],
    },
  "https://octavia.example.test/v2/lbaas/healthmonitors?limit=100&project_id=project-id":
    {
      healthmonitors: [{ id: "healthmonitor-1" }],
    },
  "https://octavia.example.test/v2/lbaas/l7policies?limit=100&project_id=project-id":
    {
      l7policies: [
        { id: "l7policy-1", rules: [{ id: "rule-1" }, { id: "rule-2" }] },
      ],
    },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("project overview loading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getServiceCatalog.mockReset();
    mocks.redirect.mockClear();
  });

  it("returns selection guidance without requesting the catalog", async () => {
    const services = await loadProjectOverview({});

    expect(services).toHaveLength(6);
    expect(services.every((service) => service.status === "unavailable")).toBe(
      true,
    );
    expect(services[0].message).toBe("Select a project and region");
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
  });

  it("shows a service-level fallback when the catalog is unavailable", async () => {
    mocks.getServiceCatalog.mockResolvedValue(null);

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(services).toHaveLength(6);
    expect(
      services.every(
        (service) =>
          service.status === "unavailable" &&
          service.message === "Service catalog is unavailable",
      ),
    ).toBe(true);
  });

  it("loads all services concurrently from the active region and project", async () => {
    mocks.getServiceCatalog.mockResolvedValue(catalog);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const payload = successfulPayloads[url];
        if (!payload) throw new Error(`Unexpected URL: ${url}`);

        expect(init).toMatchObject({ cache: "no-store" });
        expect((init?.headers as Record<string, string>)["X-Auth-Token"]).toBe(
          "project-token",
        );
        if (url.includes("manila")) {
          expect(
            (init?.headers as Record<string, string>)[
              "X-OpenStack-Manila-API-Version"
            ],
          ).toBe("2.25");
        }
        return jsonResponse(payload);
      });

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(services.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "compute", status: "available" },
      { id: "storage", status: "available" },
      { id: "network", status: "available" },
      { id: "shared-file-system", status: "available" },
      { id: "container-infra", status: "available" },
      { id: "load-balancing", status: "available" },
    ]);
    expect(services[0].metrics[2]).toMatchObject({
      id: "ram",
      used: 8,
      limit: 50,
      unit: "GiB",
    });
    expect(services[4].metrics[0]).toMatchObject({
      id: "clusters",
      used: 3,
      limit: 20,
    });
    expect(services[5].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "loadbalancer", used: 1, limit: 5 }),
        expect.objectContaining({ id: "listener", used: 2, limit: -1 }),
        expect.objectContaining({ id: "member", used: 3, limit: -1 }),
        expect.objectContaining({ id: "l7rule", used: 2, limit: -1 }),
      ]),
    );
  });

  it("represents missing endpoints and permission failures independently", async () => {
    mocks.getServiceCatalog.mockResolvedValue(
      catalog.filter((service) => service.type !== "volumev3"),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("neutron")) return jsonResponse({}, 403);
      return jsonResponse(successfulPayloads[url]);
    });

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(services.find(({ id }) => id === "compute")?.status).toBe(
      "available",
    );
    expect(services.find(({ id }) => id === "storage")).toMatchObject({
      status: "unavailable",
      message: "Not available in RegionOne",
    });
    expect(services.find(({ id }) => id === "network")).toMatchObject({
      status: "forbidden",
      message: "Quota details require permission",
    });
  });

  it("uses project-scoped Magnum stats instead of an unfiltered cluster list", async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[4]]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/quotas/")) {
          return jsonResponse({ resource: "Cluster", hard_limit: 20 });
        }
        if (
          url === "https://magnum.example.test/v1/stats?project_id=project-id"
        ) {
          return jsonResponse({ clusters: 0, nodes: 0 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(services.find(({ id }) => id === "container-infra")).toMatchObject({
      status: "available",
      metrics: [expect.objectContaining({ used: 0, limit: 20 })],
    });
  });

  it("does not follow Octavia pagination outside its catalog endpoint", async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[5]]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (
          url ===
          "https://octavia.example.test/v2/lbaas/loadbalancers?limit=100&project_id=project-id"
        ) {
          return jsonResponse({
            loadbalancers: [],
            loadbalancers_links: [
              {
                rel: "next",
                href: "https://example.invalid/v2/lbaas/loadbalancers?marker=unexpected",
              },
            ],
          });
        }
        const payload = successfulPayloads[url];
        if (!payload) throw new Error(`Unexpected URL: ${url}`);
        return jsonResponse(payload);
      });

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(services.find(({ id }) => id === "load-balancing")).toMatchObject({
      status: "error",
      message: "Quota response was not recognized",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[overview/load-balancing] invalid quota response",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("does not turn malformed quota responses into zero usage", async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[0]]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ quota_set: {} }),
    );

    const services = await loadProjectOverview({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
    });

    expect(services[0]).toMatchObject({
      status: "error",
      metrics: [],
      message: "Quota response was not recognized",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[overview/compute] invalid quota response",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("redirects to logout when an OpenStack token has expired", async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[0]]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 401));

    await expect(
      loadProjectOverview({
        token: "expired-token",
        regionId: "RegionOne",
        projectId: "project-id",
      }),
    ).rejects.toThrow("redirect:/auth/logout?reason=expired");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/logout?reason=expired");
  });
});
