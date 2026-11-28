import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverLoadBalancerCapabilities: vi.fn(),
  getServiceCatalog: vi.fn(),
  getServicePolicy: vi.fn(),
  getSession: vi.fn(),
  isServiceEnabled: vi.fn(),
  isSunriseServiceEnabled: vi.fn(),
  requestJson: vi.fn(),
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverLoadBalancerCapabilities: mocks.discoverLoadBalancerCapabilities,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION: "standard-attr-tag",
  OCTAVIA_TAGS_MICROVERSION: "2.5",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/deployment-config", () => ({
  getServicePolicy: mocks.getServicePolicy,
}));
vi.mock("@/lib/service-policy", () => ({
  isServiceEnabled: mocks.isServiceEnabled,
  isSunriseServiceEnabled: mocks.isSunriseServiceEnabled,
}));
vi.mock("@/lib/openstack/catalog", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/openstack/catalog")>();
  return {
    ...original,
    getServiceCatalog: mocks.getServiceCatalog,
  };
});
vi.mock("@/lib/openstack/request", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/openstack/request")>();
  return {
    ...original,
    requestJson: mocks.requestJson,
  };
});

import { loadGlobalSearchIndex } from "@/lib/global-search-actions";
import { globalSearchResourceValue } from "@/lib/global-search";
import { commandPaletteFilter } from "@/lib/navigation-destinations";
import { OpenStackRequestError } from "@/lib/openstack/request";

const catalog = [
  {
    name: "neutron",
    type: "network",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://neutron.example.test",
      },
    ],
  },
];

describe("global search actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "project-token",
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.getServiceCatalog.mockResolvedValue(catalog);
    mocks.getServicePolicy.mockReturnValue({});
    mocks.isServiceEnabled.mockImplementation(
      (_policy: unknown, service: string) => service === "network",
    );
    mocks.isSunriseServiceEnabled.mockReturnValue(false);
  });

  it("loads project-scoped Neutron resources with useful display names", async () => {
    mocks.requestJson.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2.0/extensions")) {
        return { extensions: [{ alias: "standard-attr-tag" }] };
      }
      if (url.includes("/networks?")) {
        return {
          networks: [
            {
              id: "network-a",
              name: "private",
              project_id: "project-a",
              status: "ACTIVE",
              tags: ["env:test"],
            },
            {
              id: "network-other",
              name: "other project",
              project_id: "project-b",
              status: "ACTIVE",
            },
            {
              id: "network-owner-missing",
              name: "missing owner",
              status: "ACTIVE",
            },
          ],
        };
      }
      if (url.includes("/routers?")) {
        return {
          routers: [
            {
              id: "router-a",
              name: "edge-router",
              project_id: "project-a",
              status: "ACTIVE",
            },
          ],
        };
      }
      if (url.includes("/floatingips?")) {
        return {
          floatingips: [
            {
              id: "floating-ip-a",
              floating_ip_address: "203.0.113.10",
              project_id: "project-a",
              status: "ACTIVE",
            },
          ],
        };
      }
      if (url.includes("/security-groups?")) {
        return {
          security_groups: [
            {
              id: "security-group-a",
              name: "default",
              project_id: "project-a",
            },
          ],
        };
      }
      if (url.includes("/ports?")) {
        return {
          ports: [
            {
              id: "port-a",
              name: "",
              project_id: "project-a",
              status: "ACTIVE",
              fixed_ips: [{ ip_address: "10.0.0.5" }],
              mac_address: "fa:16:3e:00:00:01",
            },
          ],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await loadGlobalSearchIndex();

    expect(result.unavailableSources).toEqual([]);
    expect(result.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "network",
          id: "network-a",
          name: "private",
          href: "/networking/networks/network-a",
          tags: ["env:test"],
        }),
        expect.objectContaining({
          kind: "router",
          id: "router-a",
          name: "edge-router",
          href: "/networking/routers/router-a",
        }),
        expect.objectContaining({
          kind: "floating-ip",
          id: "floating-ip-a",
          name: "203.0.113.10",
          href: "/networking/floating-ips/floating-ip-a",
        }),
        expect.objectContaining({
          kind: "security-group",
          id: "security-group-a",
          name: "default",
          href: "/networking/security-groups/security-group-a",
        }),
        expect.objectContaining({
          kind: "port",
          id: "port-a",
          name: "10.0.0.5",
          href: "/networking/ports/port-a",
        }),
      ]),
    );
    expect(result.resources).toHaveLength(5);
    expect(mocks.requestJson).toHaveBeenCalledTimes(6);
    const listCalls = mocks.requestJson.mock.calls.filter(([url]) =>
      String(url).includes("project_id=project-a"),
    );
    expect(listCalls).toHaveLength(5);
    for (const [url] of listCalls) {
      expect(url).toContain("project_id=project-a");
      expect(url).toContain("limit=100");
      expect(url).toContain("fields=id");
      expect(url).toContain("fields=project_id");
      expect(url).toContain("fields=tags");
    }
  });

  it("keeps Neutron resources searchable when tag support is absent", async () => {
    mocks.requestJson.mockImplementation(async (url: string) => {
      if (url.endsWith("/v2.0/extensions")) return { extensions: [] };
      if (url.includes("/networks?")) {
        return {
          networks: [
            {
              id: "network-a",
              name: "private",
              project_id: "project-a",
              tags: ["env:test"],
            },
          ],
        };
      }
      if (url.includes("/routers?")) return { routers: [] };
      if (url.includes("/floatingips?")) return { floatingips: [] };
      if (url.includes("/security-groups?")) {
        return { security_groups: [] };
      }
      if (url.includes("/ports?")) return { ports: [] };
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await loadGlobalSearchIndex();
    const listCalls = mocks.requestJson.mock.calls.filter(([url]) =>
      String(url).includes("project_id=project-a"),
    );

    expect(result.resources).toEqual([
      expect.objectContaining({ kind: "network" }),
    ]);
    expect(result.resources[0].tags).toBeUndefined();
    expect(listCalls).toHaveLength(5);
    for (const [url] of listCalls) {
      expect(url).not.toContain("fields=tags");
    }
  });

  it("indexes exact Glance image tags", async () => {
    mocks.getServiceCatalog.mockResolvedValue([
      {
        name: "glance",
        type: "image",
        endpoints: [
          {
            interface: "public",
            region: "RegionOne",
            url: "https://glance.example.test",
          },
        ],
      },
    ]);
    mocks.isServiceEnabled.mockImplementation(
      (_policy: unknown, service: string) => service === "image",
    );
    mocks.requestJson.mockResolvedValue({
      images: [
        {
          id: "image-a",
          name: "application image",
          status: "active",
          tags: ["env:test", "team:platform"],
        },
      ],
    });

    const result = await loadGlobalSearchIndex();

    expect(mocks.requestJson).toHaveBeenCalledOnce();
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe(
      "https://glance.example.test/v2/images?limit=100",
    );
    expect(result).toEqual({
      resources: [
        expect.objectContaining({
          kind: "image",
          id: "image-a",
          name: "application image",
          tags: ["env:test", "team:platform"],
        }),
      ],
      unavailableSources: [],
    });
  });

  it("indexes exact Nova instance tags from the existing detail response", async () => {
    mocks.getServiceCatalog.mockResolvedValue([
      {
        name: "nova",
        type: "compute",
        endpoints: [
          {
            interface: "public",
            region: "RegionOne",
            url: "https://nova.example.test",
          },
        ],
      },
    ]);
    mocks.isServiceEnabled.mockImplementation(
      (_policy: unknown, service: string) => service === "compute",
    );
    mocks.requestJson.mockResolvedValue({
      servers: [
        {
          id: "server-a",
          name: "application server",
          status: "ACTIVE",
          tags: ["env:test", "team:platform"],
        },
      ],
    });

    const result = await loadGlobalSearchIndex();

    expect(mocks.requestJson).toHaveBeenCalledOnce();
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe(
      "https://nova.example.test/servers/detail?limit=100",
    );
    expect(mocks.requestJson.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ "OpenStack-API-Version": "compute 2.79" }),
    );
    expect(result).toEqual({
      resources: [
        expect.objectContaining({
          kind: "instance",
          id: "server-a",
          name: "application server",
          tags: ["env:test", "team:platform"],
        }),
      ],
      unavailableSources: [],
    });
  });
});

describe("Octavia global search", () => {
  const listUrl =
    "https://octavia.example.test/v2/lbaas/loadbalancers?project_id=project-a&limit=100";
  const loadBalancer = {
    id: "lb-a",
    name: "api ingress",
    project_id: "PROJECTA",
    tags: ["env:test", "team:platform"],
  };
  const capabilities = {
    discoveryStatus: "available",
    microversions: { minimum: "2.0", maximum: "2.30" },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "project-token",
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.getServiceCatalog.mockResolvedValue([
      {
        name: "octavia",
        type: "load-balancer",
        endpoints: [
          {
            interface: "public",
            region: "RegionOne",
            url: "https://octavia.example.test",
          },
        ],
      },
    ]);
    mocks.getServicePolicy.mockReturnValue({});
    mocks.isServiceEnabled.mockImplementation(
      (_policy: unknown, service: string) => service === "load-balancer",
    );
    mocks.isSunriseServiceEnabled.mockReturnValue(false);
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capabilities);
    mocks.requestJson.mockResolvedValue({ loadbalancers: [loadBalancer] });
  });

  it("indexes returned tags without including foreign or unowned records or following pagination", async () => {
    mocks.requestJson.mockResolvedValue({
      loadbalancers: [
        loadBalancer,
        { id: "lb-b", project_id: "project-b", tags: ["foreign"] },
        { id: "lb-c", tags: ["unowned"] },
      ],
      loadbalancers_links: [{ rel: "next", href: `${listUrl}&marker=lb-a` }],
    });

    const result = await loadGlobalSearchIndex();

    expect(
      mocks.discoverLoadBalancerCapabilities,
    ).toHaveBeenCalledExactlyOnceWith("RegionOne");
    expect(mocks.requestJson).toHaveBeenCalledExactlyOnceWith(listUrl, {
      "X-Auth-Token": "project-token",
      "OpenStack-API-Version": "load-balancer 2.5",
    });
    expect(result.resources).toEqual([
      expect.objectContaining({
        id: "lb-a",
        kind: "load-balancer",
        href: "/networking/load-balancers/lb-a",
        tags: loadBalancer.tags,
      }),
    ]);
    expect(result.unavailableSources).toEqual([]);
    const value = globalSearchResourceValue(result.resources[0]);
    expect(commandPaletteFilter(value, "tag:team:platform")).toBeGreaterThan(0);
    expect(commandPaletteFilter(value, "tag:unowned")).toBe(0);
  });

  it("uses the advertised minimum when it exceeds the tags microversion", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      ...capabilities,
      microversions: { minimum: "2.6", maximum: "2.30" },
    });
    await loadGlobalSearchIndex();
    expect(mocks.requestJson).toHaveBeenCalledExactlyOnceWith(listUrl, {
      "X-Auth-Token": "project-token",
      "OpenStack-API-Version": "load-balancer 2.6",
    });
  });

  it.each([
    { ...capabilities, microversions: { minimum: "2.0", maximum: "2.4" } },
    { discoveryStatus: "unavailable", configuredMicroversionMaximum: "2.4" },
  ])(
    "keeps name and ID search but omits tags when disallowed: %j",
    async (capability) => {
      mocks.discoverLoadBalancerCapabilities.mockResolvedValue(capability);
      const result = await loadGlobalSearchIndex();
      expect(mocks.requestJson).toHaveBeenCalledExactlyOnceWith(listUrl, {
        "X-Auth-Token": "project-token",
      });
      expect(result.unavailableSources).toEqual([]);
      expect(result.resources[0]).toMatchObject({
        id: "lb-a",
        name: "api ingress",
      });
      expect(result.resources[0].tags).toBeUndefined();
    },
  );

  it.each([400, 406])(
    "falls back to name/ID search after %s with unknown capabilities",
    async (status) => {
      mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
        discoveryStatus: "unavailable",
      });
      mocks.requestJson.mockRejectedValueOnce(
        new OpenStackRequestError(status, "Unsupported version"),
      );
      const result = await loadGlobalSearchIndex();

      expect(mocks.requestJson.mock.calls).toEqual([
        [
          listUrl,
          {
            "X-Auth-Token": "project-token",
            "OpenStack-API-Version": "load-balancer 2.5",
          },
        ],
        [listUrl, { "X-Auth-Token": "project-token" }],
      ]);
      expect(result.unavailableSources).toEqual([]);
      expect(result.resources[0].tags).toBeUndefined();
    },
  );

  it("redirects rather than retrying an expired project token", async () => {
    mocks.discoverLoadBalancerCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
    });
    mocks.requestJson.mockRejectedValueOnce(
      new OpenStackRequestError(401, "Unauthorized"),
    );
    await expect(loadGlobalSearchIndex()).rejects.toThrow(
      "redirect:/auth/refresh",
    );
    expect(mocks.requestJson).toHaveBeenCalledOnce();
  });

  it("preserves a session refresh redirect raised during Octavia discovery", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/auth/refresh;307;",
    });
    mocks.discoverLoadBalancerCapabilities.mockRejectedValueOnce(redirect);

    await expect(loadGlobalSearchIndex()).rejects.toBe(redirect);
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });
});
