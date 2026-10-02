import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { openstack } from "@/lib/openstack/actions";

describe("public OpenStack read action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openstackRequest.mockResolvedValue({ servers: [] });
  });

  it("forwards a validated catalog-backed GET request", async () => {
    await expect(
      openstack({
        regionId: "RegionOne",
        serviceType: "compute",
        serviceName: "nova",
        path: "/servers/detail",
        apiVersion: "compute 2.79",
      }),
    ).resolves.toEqual({ servers: [] });

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/detail",
      apiVersion: "compute 2.79",
      headers: {},
      errorMode: undefined,
    });
  });

  it("does not forward server-only request controls from serialized input", async () => {
    await openstack({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/detail",
      endpointOverride: "http://169.254.169.254/latest/meta-data",
      method: "POST",
      body: { forged: true },
      unscoped: true,
    } as never);

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/detail",
      apiVersion: undefined,
      headers: {},
      errorMode: undefined,
    });
  });

  it.each([
    "//169.254.169.254/latest/meta-data",
    "https://attacker.example/request",
    "servers/detail",
    "/servers/../os-hypervisors",
    "/servers/%2e%2e/os-hypervisors",
    "/os-hypervisors",
  ])(
    "rejects a path outside the selected service endpoint: %s",
    async (path) => {
      await expect(
        openstack({
          regionId: "RegionOne",
          serviceType: "compute",
          serviceName: "nova",
          path,
        }),
      ).rejects.toThrow("Invalid OpenStack request");

      expect(mocks.openstackRequest).not.toHaveBeenCalled();
    },
  );

  it("permits only the query keys used by the selected resource", async () => {
    await openstack({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/networks?project_id=project-a",
    });

    await expect(
      openstack({
        regionId: "RegionOne",
        serviceType: "network",
        serviceName: "neutron",
        path: "/v2.0/networks?fields=id&fields=name",
      }),
    ).rejects.toThrow("Invalid OpenStack request");
  });

  it.each([
    ["compute", "nova", "/servers/server-a/os-interface"],
    ["compute", "nova", "/os-keypairs/operator-key"],
    ["image", "glance", "/v2/images/image-a"],
    ["volumev3", "cinder", "/snapshots/detail"],
    ["network", "neutron", "/v2.0/subnets?network_id=network-a"],
    ["network", "neutron", "/v2.0/default-security-group-rules"],
    ["load-balancer", "octavia", "/v2/lbaas/availabilityzones"],
    ["sharev2", "manilav2", "/project-a/share-networks/detail?all_tenants=0"],
  ])(
    "allows the supported %s/%s read route %s",
    async (serviceType, serviceName, path) => {
      await expect(
        openstack({
          regionId: "RegionOne",
          serviceType,
          serviceName,
          path,
        }),
      ).resolves.toEqual({ servers: [] });
    },
  );

  it("allows only the public Manila microversion header", async () => {
    await expect(
      openstack({
        regionId: "RegionOne",
        serviceType: "sharev2",
        serviceName: "manilav2",
        path: "/project/share-networks/detail",
        headers: { Authorization: "Bearer attacker-controlled" },
      }),
    ).rejects.toThrow("Invalid OpenStack request header");

    await openstack({
      regionId: "RegionOne",
      serviceType: "sharev2",
      serviceName: "manilav2",
      path: "/project/share-networks/detail",
      headers: { "X-OpenStack-Manila-API-Version": "2.51" },
    });

    expect(mocks.openstackRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: { "X-OpenStack-Manila-API-Version": "2.51" },
      }),
    );
  });
});
