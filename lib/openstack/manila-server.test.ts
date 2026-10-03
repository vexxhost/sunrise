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
  assertShareNetworkPlacement,
  getSecurityService,
  getShare,
  getShareNetwork,
  getShareNetworkSubnet,
  getShareSnapshot,
  listShareAccessRules,
  listSecurityServices,
  listShareNetworkSecurityServices,
  listShareNetworkSubnets,
  listShares,
} from "@/lib/openstack/manila-server";
import { OpenStackRequestError } from "@/lib/openstack/request";

describe("Manila project scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
  });

  it("filters list responses to the active project", async () => {
    mocks.openstackRequest.mockResolvedValue({
      shares: [
        {
          id: "owned",
          size: 1,
          status: "available",
          share_proto: "NFS",
          project_id: "project-a",
        },
        {
          id: "other",
          size: 1,
          status: "available",
          share_proto: "NFS",
          project_id: "project-b",
        },
      ],
    });

    await expect(listShares()).resolves.toEqual([
      expect.objectContaining({ id: "owned" }),
    ]);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/project-a/shares/detail?all_tenants=0",
      }),
    );
  });

  it.each([
    ["share", getShare, { share: { id: "resource", project_id: "other" } }],
    [
      "share network",
      getShareNetwork,
      { share_network: { id: "resource", project_id: "other" } },
    ],
    [
      "share snapshot",
      getShareSnapshot,
      {
        snapshot: {
          id: "resource",
          share_id: "share-a",
          size: 1,
          status: "available",
          project_id: "other",
        },
      },
    ],
  ])("treats a cross-project %s as missing", async (_label, read, payload) => {
    mocks.openstackRequest.mockResolvedValue(payload);

    await expect(read("resource")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
  });

  it("accepts equivalent dashed and undashed project IDs", async () => {
    mocks.getSession.mockResolvedValue({
      projectId: "7a96a68d-c826-4f3d-84fa-fd95a72265c5",
      regionId: "RegionOne",
    });
    mocks.openstackRequest.mockResolvedValue({
      share: {
        id: "share-a",
        size: 1,
        status: "available",
        share_proto: "NFS",
        project_id: "7a96a68dc8264f3d84fafd95a72265c5",
      },
    });

    await expect(getShare("share-a")).resolves.toMatchObject({ id: "share-a" });
  });

  it("does not list child resources for a cross-project share", async () => {
    mocks.openstackRequest.mockResolvedValue({
      share: {
        id: "share-a",
        size: 1,
        status: "available",
        share_proto: "NFS",
        project_id: "project-b",
      },
    });

    await expect(listShareAccessRules("share-a")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(1);
  });

  it("accepts a matching project Neutron network and subnet", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.includes("/networks/")
        ? {
            network: {
              id: "network-a",
              project_id: "project-a",
              tenant_id: "project-a",
            },
          }
        : {
            subnet: {
              id: "subnet-a",
              network_id: "network-a",
              project_id: "project-a",
              tenant_id: "project-a",
            },
          },
    );

    await expect(
      assertShareNetworkPlacement("network-a", "subnet-a"),
    ).resolves.toBeUndefined();
  });

  it("rejects a Neutron subnet from another network", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.includes("/networks/")
        ? {
            network: {
              id: "network-a",
              project_id: "project-a",
              tenant_id: "project-a",
            },
          }
        : {
            subnet: {
              id: "subnet-b",
              network_id: "network-b",
              project_id: "project-a",
              tenant_id: "project-a",
            },
          },
    );

    await expect(
      assertShareNetworkPlacement("network-a", "subnet-b"),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 400,
    );
  });

  it("lists child subnets only after reading the project-owned parent", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.endsWith("/share-networks/share-network-a")
        ? {
            share_network: {
              id: "share-network-a",
              project_id: "project-a",
            },
          }
        : {
            share_network_subnets: [
              {
                id: "subnet-a",
                share_network_id: "share-network-a",
              },
              { id: "subnet-b", share_network_id: "other-network" },
            ],
          },
    );

    await expect(listShareNetworkSubnets("share-network-a")).resolves.toEqual([
      expect.objectContaining({ id: "subnet-a" }),
    ]);
    expect(mocks.openstackRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/project-a/share-networks/share-network-a/subnets",
      }),
    );
  });

  it("rejects a subnet returned for another share network", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.endsWith("/share-networks/share-network-a")
        ? {
            share_network: {
              id: "share-network-a",
              project_id: "project-a",
            },
          }
        : {
            share_network_subnet: {
              id: "subnet-a",
              share_network_id: "other-network",
            },
          },
    );

    await expect(
      getShareNetworkSubnet("share-network-a", "subnet-a"),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
  });

  it("filters security services to the active project and redacts passwords", async () => {
    mocks.openstackRequest.mockResolvedValue({
      security_services: [
        {
          id: "owned",
          name: "owned-directory",
          type: "ldap",
          project_id: "project-a",
          password: "must-not-cross-the-server-boundary",
        },
        {
          id: "other",
          name: "other-directory",
          type: "ldap",
          project_id: "project-b",
          password: "other-secret",
        },
      ],
    });

    const services = await listSecurityServices();

    expect(services).toEqual([
      expect.objectContaining({ id: "owned", name: "owned-directory" }),
    ]);
    expect(services[0]).not.toHaveProperty("password");
  });

  it("redacts a security-service password from detail responses", async () => {
    mocks.openstackRequest.mockResolvedValue({
      security_service: {
        id: "service-a",
        type: "kerberos",
        project_id: "project-a",
        password: "secret",
      },
    });

    const service = await getSecurityService("service-a");

    expect(service).toMatchObject({ id: "service-a", type: "kerberos" });
    expect(service).not.toHaveProperty("password");
  });

  it("derives share-network attachments from project security services", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path.endsWith("/share-networks/share-network-a")) {
        return {
          share_network: {
            id: "share-network-a",
            project_id: "project-a",
          },
        };
      }
      return {
        security_services: [
          {
            id: "attached",
            type: "ldap",
            project_id: "project-a",
            share_networks: [{ id: "share-network-a" }],
          },
          {
            id: "unattached",
            type: "kerberos",
            project_id: "project-a",
            share_networks: [],
          },
        ],
      };
    });

    await expect(
      listShareNetworkSecurityServices("share-network-a"),
    ).resolves.toEqual([expect.objectContaining({ id: "attached" })]);
  });
});
