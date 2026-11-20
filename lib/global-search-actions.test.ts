import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  getServicePolicy: vi.fn(),
  getSession: vi.fn(),
  isServiceEnabled: vi.fn(),
  isSunriseServiceEnabled: vi.fn(),
  requestJson: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
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
      if (url.includes("/networks?")) {
        return {
          networks: [
            {
              id: "network-a",
              name: "private",
              project_id: "project-a",
              status: "ACTIVE",
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
    expect(mocks.requestJson).toHaveBeenCalledTimes(5);
    for (const [url] of mocks.requestJson.mock.calls) {
      expect(url).toContain("project_id=project-a");
      expect(url).toContain("limit=100");
      expect(url).toContain("fields=id");
      expect(url).toContain("fields=project_id");
    }
  });
});
