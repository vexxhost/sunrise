import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertShareNetworkPlacement: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getShare: vi.fn(),
  getShareNetwork: vi.fn(),
  getShareSnapshot: vi.fn(),
  guardMutationContext: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/manila-server", () => ({
  assertShareNetworkPlacement: mocks.assertShareNetworkPlacement,
  getShare: mocks.getShare,
  getShareNetwork: mocks.getShareNetwork,
  getShareSnapshot: mocks.getShareSnapshot,
  MANILA_API_VERSION: "2.51",
  MANILA_SERVICE: { serviceType: "sharev2", serviceName: "manila" },
}));

import {
  createShareAction,
  createShareNetworkAction,
  createShareSnapshotAction,
  deleteShareSnapshotAction,
  deleteShareAction,
  grantShareAccessAction,
  resizeShareAction,
  updateShareNetworkAction,
} from "@/lib/openstack/manila-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Manila mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
    mocks.getShare.mockResolvedValue({
      id: "share-a",
      size: 20,
      status: "available",
      share_proto: "NFS",
    });
    mocks.getShareSnapshot.mockResolvedValue({
      id: "snapshot-a",
      share_id: "share-a",
      size: 20,
      status: "available",
    });
    mocks.getShareNetwork.mockResolvedValue({
      id: "share-network-a",
      name: "team-network",
      project_id: "project-a",
    });
    mocks.assertShareNetworkPlacement.mockResolvedValue(undefined);
  });

  it("narrows share creation to supported Manila fields", async () => {
    await createShareAction(scope, {
      name: "team-data",
      description: "Shared files",
      size: "10",
      protocol: "NFS",
      shareType: "type-a",
      shareNetworkId: "network-a",
      availabilityZone: "nova",
      isPublic: false,
      metadata: { environment: "test" },
      unexpected: "ignored",
    } as never);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/shares",
        headers: { "X-OpenStack-Manila-API-Version": "2.51" },
        body: {
          share: {
            name: "team-data",
            description: "Shared files",
            size: 10,
            share_proto: "NFS",
            share_type: "type-a",
            share_network_id: "network-a",
            availability_zone: "nova",
            is_public: false,
            metadata: { environment: "test" },
          },
        },
      }),
    );
  });

  it("chooses the resize action from the server-side current size", async () => {
    await resizeShareAction(scope, "share-a", { newSize: "8" });

    expect(mocks.getShare).toHaveBeenCalledWith("share-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/project-a/shares/share-a/action",
        body: { shrink: { new_size: 8 } },
      }),
    );
  });

  it("returns a mutation failure when the resize preflight read fails", async () => {
    mocks.getShare.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), {
        name: "OpenStackRequestError",
        status: 404,
      }),
    );

    const result = await resizeShareAction(scope, "share-a", { newSize: "8" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps access grants to Manila's share action API", async () => {
    await grantShareAccessAction(scope, "share-a", {
      accessType: "ip",
      accessTo: "10.0.0.0/24",
      accessLevel: "ro",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/project-a/shares/share-a/action",
        body: {
          allow_access: {
            access_type: "ip",
            access_to: "10.0.0.0/24",
            access_level: "ro",
          },
        },
      }),
    );
  });

  it("removes a deleted share from saved resources", async () => {
    await deleteShareAction(scope, "share-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/project-a/shares/share-a",
        removedResource: { kind: "share", id: "share-a" },
      }),
    );
  });

  it("rejects invalid sizes before calling Manila", async () => {
    const result = await createShareAction(scope, {
      name: "invalid",
      size: "0",
      protocol: "NFS",
      isPublic: false,
      metadata: {},
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("creates a non-forced snapshot from the selected share", async () => {
    await createShareSnapshotAction(scope, {
      shareId: "share-a",
      name: "before-upgrade",
      description: "Release checkpoint",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/snapshots",
        body: {
          snapshot: {
            share_id: "share-a",
            force: false,
            name: "before-upgrade",
            description: "Release checkpoint",
          },
        },
      }),
    );
  });

  it("removes a deleted share snapshot from saved resources", async () => {
    await deleteShareSnapshotAction(scope, "snapshot-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/project-a/snapshots/snapshot-a",
        removedResource: { kind: "share-snapshot", id: "snapshot-a" },
      }),
    );
  });

  it("does not mutate a share snapshot that is not visible in the active project", async () => {
    mocks.getShareSnapshot.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), {
        name: "OpenStackRequestError",
        status: 404,
      }),
    );

    const result = await deleteShareSnapshotAction(scope, "snapshot-a");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("creates a share network with a verified Neutron placement", async () => {
    await createShareNetworkAction(scope, {
      name: "team-network",
      description: "Team file services",
      neutronNetworkId: "network-a",
      neutronSubnetId: "subnet-a",
      availabilityZone: "nova",
    });

    expect(mocks.assertShareNetworkPlacement).toHaveBeenCalledWith(
      "network-a",
      "subnet-a",
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/share-networks",
        body: {
          share_network: {
            name: "team-network",
            description: "Team file services",
            neutron_net_id: "network-a",
            neutron_subnet_id: "subnet-a",
            availability_zone: "nova",
          },
        },
      }),
    );
  });

  it("rejects a partial Neutron placement", async () => {
    const result = await createShareNetworkAction(scope, {
      name: "team-network",
      neutronNetworkId: "network-a",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("edits share-network display details after an ownership preflight", async () => {
    await updateShareNetworkAction(scope, "share-network-a", {
      name: "renamed-network",
      description: "Updated description",
    });

    expect(mocks.getShareNetwork).toHaveBeenCalledWith("share-network-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/project-a/share-networks/share-network-a",
        body: {
          share_network: {
            name: "renamed-network",
            description: "Updated description",
          },
        },
      }),
    );
  });
});
