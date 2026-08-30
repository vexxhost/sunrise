import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeOpenStackMutation: vi.fn() }));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

import {
  addRouterInterfaceAction,
  addRouterRouteAction,
  createNetworkAction,
  createSecurityGroupRuleAction,
  createSubnetAction,
  deleteFloatingIpAction,
  deleteNetworkAction,
  deletePortAction,
  deleteRouterAction,
  deleteSecurityGroupAction,
  deleteSubnetAction,
  removeRouterInterfaceAction,
  removeRouterRouteAction,
  replaceRouterRouteAction,
  replaceSecurityGroupRuleAction,
  setRouterGatewayAction,
  updateSubnetAction,
} from "@/lib/openstack/neutron-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Neutron mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
  });

  it("narrows network creation to supported Neutron fields", async () => {
    await createNetworkAction(scope, {
      name: "application",
      description: "Application network",
      adminStateUp: true,
      portSecurityEnabled: true,
      unexpected: "ignored",
    } as never);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/v2.0/networks",
        body: {
          network: {
            name: "application",
            description: "Application network",
            admin_state_up: true,
            port_security_enabled: true,
          },
        },
      }),
    );
  });

  it("maps router gateway and interface operations to Neutron", async () => {
    await setRouterGatewayAction(scope, "router-a", {
      networkId: "external-a",
      enableSnat: true,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/v2.0/routers/router-a",
        body: {
          router: {
            external_gateway_info: {
              network_id: "external-a",
              enable_snat: true,
            },
          },
        },
      }),
    );

    await addRouterInterfaceAction(scope, "router-a", {
      subnetId: "subnet-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router-a/add_router_interface",
        body: { subnet_id: "subnet-a" },
      }),
    );

    await removeRouterInterfaceAction(scope, "router-a", {
      subnetId: "subnet-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router-a/remove_router_interface",
        body: { subnet_id: "subnet-a" },
      }),
    );
  });

  it("adds and removes router routes atomically", async () => {
    const route = {
      destination: "172.20.0.0/16",
      nexthop: "10.20.30.2",
    };

    await addRouterRouteAction(scope, "router-a", route);
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/v2.0/routers/router-a/add_extraroutes",
        body: { router: { routes: [route] } },
      }),
    );

    await removeRouterRouteAction(scope, "router-a", route);
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/v2.0/routers/router-a/remove_extraroutes",
        body: { router: { routes: [route] } },
      }),
    );
  });

  it("rejects mixed IP versions in a router route", async () => {
    const result = await addRouterRouteAction(scope, "router-a", {
      destination: "2001:db8::/64",
      nexthop: "10.20.30.2",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "The destination and next hop must use the same IP version.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("replaces a router route without replacing the full route table", async () => {
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: { id: "router-a", routes: options.body.router.routes },
      message: options.successMessage,
      scope,
    }));

    const result = await replaceRouterRouteAction(
      scope,
      "router-a",
      { destination: "172.20.0.0/16", nexthop: "10.20.30.2" },
      { destination: "172.21.0.0/16", nexthop: "10.20.30.3" },
    );

    expect(result).toMatchObject({
      ok: true,
      message: "Static route updated.",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/v2.0/routers/router-a/add_extraroutes",
        invalidates: [],
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/v2.0/routers/router-a/remove_extraroutes",
      }),
    );
  });

  it("maps explicit DHCP pools and DNS servers to subnet mutations", async () => {
    const addressing = {
      allocationPools: [{ start: "10.20.30.20", end: "10.20.30.220" }],
      dnsNameservers: ["1.1.1.1", "9.9.9.9"],
    };

    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "application-subnet",
      description: "Application addressing",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      enableDhcp: true,
      ...addressing,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/v2.0/subnets",
        body: {
          subnet: expect.objectContaining({
            allocation_pools: addressing.allocationPools,
            dns_nameservers: addressing.dnsNameservers,
          }),
        },
      }),
    );

    await updateSubnetAction(scope, "subnet-a", {
      name: "application-subnet",
      description: "Updated addressing",
      gatewayIp: "10.20.30.1",
      enableDhcp: true,
      ...addressing,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "PUT",
        path: "/v2.0/subnets/subnet-a",
        body: {
          subnet: expect.objectContaining({
            allocation_pools: addressing.allocationPools,
            dns_nameservers: addressing.dnsNameservers,
          }),
        },
      }),
    );
  });

  it("rejects reversed security group port ranges", async () => {
    const result = await createSecurityGroupRuleAction(scope, {
      securityGroupId: "group-a",
      direction: "ingress",
      ethertype: "IPv4",
      protocol: "tcp",
      portRangeMin: 8443,
      portRangeMax: 443,
      remoteIpPrefix: "0.0.0.0/0",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("replaces a changed security group rule before deleting the original", async () => {
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data:
        options.path === "/v2.0/security-group-rules"
          ? { id: "rule-replacement" }
          : null,
      message: options.successMessage,
      scope,
    }));
    const original = {
      securityGroupId: "group-a",
      description: "SSH",
      direction: "ingress" as const,
      ethertype: "IPv4" as const,
      protocol: "tcp",
      portRangeMin: 22,
      portRangeMax: 22,
      remoteIpPrefix: "10.0.0.0/8",
    };

    const result = await replaceSecurityGroupRuleAction(
      scope,
      "rule-original",
      original,
      { ...original, portRangeMin: 2222, portRangeMax: 2222 },
    );

    expect(result).toMatchObject({
      ok: true,
      message: "Security group rule updated.",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "POST",
        path: "/v2.0/security-group-rules",
        invalidates: [],
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "DELETE",
        path: "/v2.0/security-group-rules/rule-original",
      }),
    );
  });

  it("restores a security group rule when a description replacement fails", async () => {
    mocks.executeOpenStackMutation
      .mockResolvedValueOnce({
        ok: true,
        status: "success",
        data: null,
        message: "Security group rule deleted.",
        scope,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: "error",
        error: {
          code: "conflict",
          message: "Replacement rejected.",
          retryable: false,
        },
        scope,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "success",
        data: { id: "rule-restored" },
        message: "Security group rule created.",
        scope,
      });
    const original = {
      securityGroupId: "group-a",
      description: "Original",
      direction: "ingress" as const,
      ethertype: "IPv4" as const,
      protocol: "tcp",
      portRangeMin: 22,
      portRangeMax: 22,
      remoteIpPrefix: "10.0.0.0/8",
    };

    const result = await replaceSecurityGroupRuleAction(
      scope,
      "rule-original",
      original,
      { ...original, description: "Updated" },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        message:
          "The replacement was rejected, so the original rule was restored.",
      },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(3);
  });

  it("does not revalidate a deleted resource detail route", async () => {
    await deleteNetworkAction(scope, "network-a");
    await deleteRouterAction(scope, "router-a");
    await deletePortAction(scope, "port-a");
    await deleteFloatingIpAction(scope, "floating-ip-a");
    await deleteSecurityGroupAction(scope, "security-group-a");

    for (const [options] of mocks.executeOpenStackMutation.mock.calls) {
      expect(options).toMatchObject({ method: "DELETE", invalidates: [] });
    }
  });

  it("maps subnet deletion to Neutron and refreshes the parent network", async () => {
    await deleteSubnetAction(scope, "subnet-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/v2.0/subnets/subnet-a",
        invalidates: ["/compute", "/compute/networks"],
      }),
    );
  });
});
