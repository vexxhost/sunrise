import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeOpenStackMutation: vi.fn() }));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

import {
  addRouterInterfaceAction,
  addRouterRouteAction,
  createNetworkAction,
  createPortAction,
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
  updatePortAction,
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

  it("clears security groups when port security is disabled", async () => {
    const port = {
      name: "application-port",
      description: "Application interface",
      adminStateUp: true,
      portSecurityEnabled: false,
      securityGroupIds: ["security-group-a"],
    };

    await createPortAction(scope, {
      ...port,
      networkId: "network-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            port_security_enabled: false,
            security_groups: [],
          }),
        },
      }),
    );

    await updatePortAction(scope, "port-a", port);
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            port_security_enabled: false,
            security_groups: [],
          }),
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

  it("maps explicit subnet addressing controls to Neutron mutations", async () => {
    const addressing = {
      allocationPools: [{ start: "10.20.30.20", end: "10.20.30.220" }],
      dnsNameservers: ["1.1.1.1", "9.9.9.9"],
      hostRoutes: [{ destination: "172.20.0.0/16", nexthop: "10.20.30.2" }],
    };

    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "application-subnet",
      description: "Application addressing",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      disableGateway: false,
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
            gateway_ip: "10.20.30.1",
            host_routes: addressing.hostRoutes,
          }),
        },
      }),
    );

    await updateSubnetAction(scope, "subnet-a", {
      name: "application-subnet",
      description: "Updated addressing",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      disableGateway: false,
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
            gateway_ip: "10.20.30.1",
            host_routes: addressing.hostRoutes,
          }),
        },
      }),
    );
  });

  it("preserves automatic and disabled gateway semantics", async () => {
    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "automatic-gateway",
      description: "",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      disableGateway: false,
      enableDhcp: true,
    });
    const automaticGatewayRequest =
      mocks.executeOpenStackMutation.mock.calls.at(-1)?.[0];
    expect(automaticGatewayRequest.body.subnet).not.toHaveProperty(
      "gateway_ip",
    );

    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "disabled-gateway",
      description: "",
      cidr: "2001:db8::/64",
      ipVersion: 6,
      disableGateway: true,
      enableDhcp: true,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({ gateway_ip: null }),
        },
      }),
    );

    await updateSubnetAction(scope, "subnet-a", {
      name: "disabled-gateway",
      description: "",
      cidr: "2001:db8::/64",
      ipVersion: 6,
      disableGateway: true,
      enableDhcp: true,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({ gateway_ip: null }),
        },
      }),
    );
  });

  it("rejects subnet fields that do not match the selected IP version", async () => {
    const cidrResult = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "mixed-subnet",
      description: "",
      cidr: "2001:db8::/64",
      ipVersion: 4,
      disableGateway: false,
      enableDhcp: true,
    });

    expect(cidrResult).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "The CIDR must use IPv4.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();

    const routeResult = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "mixed-route",
      description: "",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      disableGateway: false,
      enableDhcp: true,
      hostRoutes: [{ destination: "2001:db8::/64", nexthop: "10.20.30.2" }],
    });

    expect(routeResult).toMatchObject({
      ok: false,
      error: { code: "validation-failed", message: "Use an IPv4 address." },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires a gateway address when enabling one during subnet editing", async () => {
    const result = await updateSubnetAction(scope, "subnet-a", {
      name: "application-subnet",
      description: "",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      disableGateway: false,
      enableDhcp: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "Enter a gateway address or disable the gateway.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps supported IPv6 address configuration modes", async () => {
    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "openstack-slaac",
      description: "",
      cidr: "2001:db8:1::/64",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: true,
      ipv6Mode: "slaac-openstack",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({
            ipv6_address_mode: "slaac",
            ipv6_ra_mode: "slaac",
          }),
        },
      }),
    );

    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "external-slaac",
      description: "",
      cidr: "2001:db8:2::/64",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: true,
      ipv6Mode: "slaac-external",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({
            ipv6_address_mode: "slaac",
            ipv6_ra_mode: null,
          }),
        },
      }),
    );
  });

  it("keeps IPv6 address configuration immutable during subnet updates", async () => {
    await updateSubnetAction(scope, "subnet-a", {
      name: "external-slaac",
      description: "",
      cidr: "2001:db8:2::/64",
      ipVersion: 6,
      disableGateway: true,
      enableDhcp: true,
      currentIpv6Mode: "slaac-external",
    });

    const subnetRequest =
      mocks.executeOpenStackMutation.mock.calls.at(-1)?.[0].body.subnet;
    expect(subnetRequest).not.toHaveProperty("ipv6_address_mode");
    expect(subnetRequest).not.toHaveProperty("ipv6_ra_mode");
  });

  it("preserves DHCP required by an existing IPv6 mode", async () => {
    const result = await updateSubnetAction(scope, "subnet-a", {
      name: "external-slaac",
      description: "",
      cidr: "2001:db8:2::/64",
      ipVersion: 6,
      disableGateway: true,
      enableDhcp: false,
      currentIpv6Mode: "slaac-external",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message:
          "DHCP cannot be disabled while IPv6 address configuration is active.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects incompatible IPv6 address configuration", async () => {
    const dhcpResult = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "slaac-without-dhcp",
      description: "",
      cidr: "2001:db8::/64",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: false,
      ipv6Mode: "slaac-openstack",
    });
    expect(dhcpResult).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "Enable DHCP to use IPv6 address configuration.",
      },
    });

    const prefixResult = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "invalid-slaac-prefix",
      description: "",
      cidr: "2001:db8::/56",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: true,
      ipv6Mode: "dhcpv6-stateless",
    });
    expect(prefixResult).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message:
          "A /64 prefix is required for SLAAC and DHCPv6 stateless addressing.",
      },
    });

    const ipv4Result = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "ipv4-slaac",
      description: "",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      disableGateway: false,
      enableDhcp: true,
      ipv6Mode: "slaac-openstack",
    });
    expect(ipv4Result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message:
          "IPv6 address configuration is only available for IPv6 subnets.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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
        invalidates: ["/networking", "/networking/topology"],
      }),
    );
  });
});
