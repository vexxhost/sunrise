import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertShareNetworkPlacement: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getSecurityService: vi.fn(),
  getShare: vi.fn(),
  getShareNetwork: vi.fn(),
  getShareNetworkSubnet: vi.fn(),
  getShareSnapshot: vi.fn(),
  getUserMessage: vi.fn(),
  guardMutationContext: vi.fn(),
  listShares: vi.fn(),
  manilaDetailApiVersion: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  manilaDetailApiVersion: mocks.manilaDetailApiVersion,
}));
vi.mock("@/lib/openstack/manila-server", () => ({
  assertShareNetworkPlacement: mocks.assertShareNetworkPlacement,
  getSecurityService: mocks.getSecurityService,
  getShare: mocks.getShare,
  getShareNetwork: mocks.getShareNetwork,
  getShareNetworkSubnet: mocks.getShareNetworkSubnet,
  getShareSnapshot: mocks.getShareSnapshot,
  getUserMessage: mocks.getUserMessage,
  listShares: mocks.listShares,
  MANILA_SERVICE: { serviceType: "sharev2", serviceName: "manila" },
}));

import {
  attachShareNetworkSecurityServiceAction,
  checkShareNetworkSecurityServiceAttachAction,
  createSecurityServiceAction,
  createShareAction,
  createShareNetworkAction,
  createShareNetworkSubnetAction,
  createShareSnapshotAction,
  deleteShareSnapshotAction,
  deleteShareAction,
  deleteShareNetworkAction,
  deleteShareNetworkSubnetAction,
  deleteUserMessageAction,
  detachShareNetworkSecurityServiceAction,
  grantShareAccessAction,
  resizeShareAction,
  updateShareAction,
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
    mocks.executeOpenStackMutation.mockImplementation(async (options) => {
      const body = options.body as Record<string, unknown> | undefined;
      const compatibilityPayload = body?.add_security_service_check
        ? {
            compatible: true,
            requested_operation: {
              operation: "add_security_service",
              current_security_service: null,
              new_security_service: "security-service-a",
            },
          }
        : null;
      return {
        ok: true,
        status: "success",
        data:
          compatibilityPayload && options.transform
            ? options.transform(compatibilityPayload)
            : compatibilityPayload,
        message: options.successMessage,
        scope,
      };
    });
    mocks.getShare.mockResolvedValue({
      id: "share-a",
      size: 20,
      status: "available",
      share_proto: "NFS",
      metadata: { environment: "old" },
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
      security_service_update_support: true,
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
    mocks.getUserMessage.mockResolvedValue({
      id: "message-a",
      action_id: "002",
      detail_id: "004",
      message_level: "ERROR",
      project_id: "project-a",
      request_id: "req-a",
      resource_id: "share-a",
      resource_type: "SHARE",
      user_message: "create: Share server allocation failed.",
    });
    mocks.assertShareNetworkPlacement.mockResolvedValue(undefined);
    mocks.listShares.mockResolvedValue([]);
    mocks.manilaDetailApiVersion.mockResolvedValue("2.70");
  });

  it("preflights and deletes a project user message", async () => {
    await deleteUserMessageAction(scope, "message-a");

    expect(mocks.getUserMessage).toHaveBeenCalledWith("message-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/project-a/messages/message-a",
        apiVersion: "2.51",
        apiVersionHeader: "X-OpenStack-Manila-API-Version",
      }),
    );
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
        apiVersion: "2.51",
        apiVersionHeader: "X-OpenStack-Manila-API-Version",
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
      accessType: "cephx",
      accessTo: "alice",
      accessLevel: "ro",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/project-a/shares/share-a/action",
        body: {
          allow_access: {
            access_type: "cephx",
            access_to: "alice",
            access_level: "ro",
          },
        },
      }),
    );
  });

  it("updates share details and replaces metadata", async () => {
    mocks.executeOpenStackMutation
      .mockResolvedValueOnce({
        ok: true,
        status: "success",
        data: { id: "share-a", metadata: { environment: "old" } },
        message: "Share details updated.",
        scope,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "success",
        data: { environment: "new" },
        message: "Share metadata updated.",
        scope,
      });

    const result = await updateShareAction(scope, "share-a", {
      name: "team-data",
      description: "Shared files",
      isPublic: false,
      metadata: { environment: "new" },
    });

    expect(result).toMatchObject({
      ok: true,
      data: { metadata: { environment: "new" } },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "PUT",
        path: "/project-a/shares/share-a/metadata",
        body: { metadata: { environment: "new" } },
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

  it("creates an additional share-network subnet with the negotiated API version", async () => {
    await createShareNetworkSubnetAction(scope, "share-network-a", {
      neutronNetworkId: "network-a",
      neutronSubnetId: "subnet-a",
      availabilityZone: "manila-zone-a",
    });

    expect(mocks.getShareNetwork).toHaveBeenCalledWith(
      "share-network-a",
      "2.70",
    );
    expect(mocks.assertShareNetworkPlacement).toHaveBeenCalledWith(
      "network-a",
      "subnet-a",
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/project-a/share-networks/share-network-a/subnets",
        apiVersion: "2.70",
        apiVersionHeader: "X-OpenStack-Manila-API-Version",
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

  it("rejects subnet changes while another network allocation change is running", async () => {
    mocks.getShareNetwork.mockResolvedValueOnce({
      id: "share-network-a",
      project_id: "project-a",
      status: "network_change",
    });

    const result = await createShareNetworkSubnetAction(
      scope,
      "share-network-a",
      {
        neutronNetworkId: "network-a",
        neutronSubnetId: "subnet-a",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.assertShareNetworkPlacement).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects subnet additions to an in-use network without backend support", async () => {
    mocks.getShareNetwork.mockResolvedValueOnce({
      id: "share-network-a",
      project_id: "project-a",
      status: "active",
      network_allocation_update_support: false,
    });

    const result = await createShareNetworkSubnetAction(
      scope,
      "share-network-a",
      {
        neutronNetworkId: "network-a",
        neutronSubnetId: "subnet-a",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("allows subnet additions to an in-use network when Manila confirms support", async () => {
    mocks.getShareNetwork.mockResolvedValueOnce({
      id: "share-network-a",
      project_id: "project-a",
      status: "active",
      network_allocation_update_support: true,
    });

    await createShareNetworkSubnetAction(scope, "share-network-a", {
      neutronNetworkId: "network-a",
      neutronSubnetId: "subnet-a",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: "2.70" }),
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

  it("checks compatibility before attaching a security service", async () => {
    await attachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(mocks.getShareNetwork).toHaveBeenCalledWith(
      "share-network-a",
      "2.70",
    );
    expect(mocks.getSecurityService).toHaveBeenCalledWith("security-service-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        apiVersion: "2.70",
        body: {
          add_security_service_check: {
            reset_operation: false,
            security_service_id: "security-service-a",
          },
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        path: "/project-a/share-networks/share-network-a/action",
        apiVersion: "2.70",
        body: {
          add_security_service: {
            security_service_id: "security-service-a",
          },
        },
      }),
    );
  });

  it("returns a retryable result while the compatibility check is pending", async () => {
    mocks.executeOpenStackMutation.mockResolvedValueOnce({
      ok: true,
      status: "success",
      data: { compatible: null },
      message: "Security-service compatibility checked.",
      scope,
    });

    const result = await attachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: true },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
  });

  it("does not call Manila when the share servers cannot update security services", async () => {
    mocks.getShareNetwork.mockResolvedValueOnce({
      id: "share-network-a",
      status: "active",
      security_service_update_support: false,
    });

    const result = await attachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("uses the legacy attach action when Manila 2.63 is unavailable", async () => {
    mocks.manilaDetailApiVersion.mockResolvedValueOnce("2.51");

    await attachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "2.51",
        body: {
          add_security_service: {
            security_service_id: "security-service-a",
          },
        },
      }),
    );
  });

  it("can restart an attach compatibility check", async () => {
    await checkShareNetworkSecurityServiceAttachAction(
      scope,
      "share-network-a",
      "security-service-a",
      true,
    );

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "2.70",
        body: {
          add_security_service_check: {
            reset_operation: true,
            security_service_id: "security-service-a",
          },
        },
      }),
    );
  });

  it("blocks detach while a project share uses the network", async () => {
    mocks.listShares.mockResolvedValueOnce([
      { id: "share-a", share_network_id: "share-network-a" },
    ]);

    const result = await detachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("detaches a security service from an unused network", async () => {
    await detachShareNetworkSecurityServiceAction(
      scope,
      "share-network-a",
      "security-service-a",
    );

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "2.70",
        body: {
          remove_security_service: {
            security_service_id: "security-service-a",
          },
        },
      }),
    );
  });
});
