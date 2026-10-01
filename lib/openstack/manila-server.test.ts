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
  getShare,
  getShareNetwork,
  getShareSnapshot,
  listShareAccessRules,
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
});
