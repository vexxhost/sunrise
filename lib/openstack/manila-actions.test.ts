import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertShareNetworkPlacement: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getSecurityService: vi.fn(),
  getShare: vi.fn(),
  getShareNetwork: vi.fn(),
  getShareNetworkSubnet: vi.fn(),
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
  getSecurityService: mocks.getSecurityService,
  getShare: mocks.getShare,
  getShareNetwork: mocks.getShareNetwork,
  getShareNetworkSubnet: mocks.getShareNetworkSubnet,
  getShareSnapshot: mocks.getShareSnapshot,
  MANILA_API_VERSION: "2.51",
  MANILA_SERVICE: { serviceType: "sharev2", serviceName: "manila" },
}));

import {
  attachShareNetworkSecurityServiceAction,
  createSecurityServiceAction,
  createShareAction,
  createShareNetworkAction,
  createShareNetworkSubnetAction,
  createShareSnapshotAction,
  deleteShareSnapshotAction,
  deleteShareAction,
  deleteShareNetworkAction,
  deleteShareNetworkSubnetAction,
  grantShareAccessAction,
  resizeShareAction,
  updateShareNetworkAction,
  updateSecurityServiceAction,
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
    mocks.getShareNetworkSubnet.mockResolvedValue({
      id: "network-subnet-a",
      share_network_id: "share-network-a",
    });
    mocks.getSecurityService.mockResolvedValue({
      id: "security-service-a",
      name: "team-directory",
      project_id: "project-a",
      status: "new",
      type: "ldap",
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

  it("creates an additional share-network subnet with the v2.51 body key", async () => {
    await createShareNetworkSubnetAction(scope, "share-network-a", {
      neutronNetworkId: "network-a",
      neutronSubnetId: "subnet-a",
      availabilityZone: "manila-zone-a",
    });

    expect(mocks.getShareNetwork).toHaveBeenCalledWith("share-network-a");
    expect(mocks.assertShareNetworkPlacement).toHaveBeenCalledWith(
      "network-a",
      "subnet-a",
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/share-networks/share-network-a/subnets",
        body: {
          "share-network-subnet": {
            neutron_net_id: "network-a",
            neutron_subnet_id: "subnet-a",
            availability_zone: "manila-zone-a",
          },
        },
      }),
    );
  });

  it("preflights the child resource before deleting a network subnet", async () => {
    await deleteShareNetworkSubnetAction(
      scope,
      "share-network-a",
      "network-subnet-a",
    );

    expect(mocks.getShareNetworkSubnet).toHaveBeenCalledWith(
      "share-network-a",
      "network-subnet-a",
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/project-a/share-networks/share-network-a/subnets/network-subnet-a",
      }),
    );
  });

  it("preflights the parent before deleting a share network", async () => {
    await deleteShareNetworkAction(scope, "share-network-a");

    expect(mocks.getShareNetwork).toHaveBeenCalledWith("share-network-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/project-a/share-networks/share-network-a",
      }),
    );
  });

  it("creates a security service without expanding unsupported fields", async () => {
    await createSecurityServiceAction(scope, {
      type: "active_directory",
      name: "team-directory",
      description: "Project directory",
      dnsIp: "192.0.2.53",
      server: "ad.example.com",
      domain: "example.com",
      ou: "OU=File Servers",
      user: "svc-manila",
      password: "secret",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/security-services",
        body: {
          security_service: {
            type: "active_directory",
            name: "team-directory",
            description: "Project directory",
            dns_ip: "192.0.2.53",
            server: "ad.example.com",
            domain: "example.com",
            ou: "OU=File Servers",
            user: "svc-manila",
            password: "secret",
          },
        },
      }),
    );
  });

  it("limits active security-service updates to display fields", async () => {
    mocks.getSecurityService.mockResolvedValueOnce({
      id: "security-service-a",
      name: "team-directory",
      status: "active",
      type: "ldap",
    });

    await updateSecurityServiceAction(scope, "security-service-a", {
      name: "renamed-directory",
      description: "Updated",
      dnsIp: "192.0.2.54",
      server: "new.example.com",
      user: "new-user",
      password: "new-password",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          security_service: {
            name: "renamed-directory",
            description: "Updated",
          },
        },
      }),
    );
  });

  it("preflights both resources before attaching a security service", async () => {
    await attachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(mocks.getShareNetwork).toHaveBeenCalledWith("share-network-a");
    expect(mocks.getSecurityService).toHaveBeenCalledWith("security-service-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/share-networks/share-network-a/action",
        body: {
          add_security_service: {
            security_service_id: "security-service-a",
          },
        },
      }),
    );
  });
});
