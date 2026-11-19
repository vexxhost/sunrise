import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverNetworkCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverNetworkCapabilities: mocks.discoverNetworkCapabilities,
  NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION: "allowed-address-pairs",
  NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION: "extraroute-atomic",
  NEUTRON_DNS_DOMAIN_PORTS_EXTENSION: "dns-domain-ports",
  NEUTRON_DNS_INTEGRATION_EXTENSION: "dns-integration",
  NEUTRON_EXTRA_DHCP_OPTIONS_EXTENSION: "extra_dhcp_opt",
  NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION: "network_availability_zone",
  NEUTRON_NETWORK_MTU_WRITABLE_EXTENSION: "net-mtu-writable",
  NEUTRON_PORT_BINDING_EXTENSION: "binding",
  NEUTRON_PORT_HARDWARE_OFFLOAD_TYPE_EXTENSION: "port-hardware-offload-type",
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_EXTENSION: "port-numa-affinity-policy",
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_SOCKET_EXTENSION:
    "port-numa-affinity-policy-socket",
  NEUTRON_PORT_SECURITY_EXTENSION: "port-security",
  NEUTRON_PORT_TRUSTED_VIF_EXTENSION: "port-trusted-vif",
  NEUTRON_QOS_EXTENSION: "qos",
  NEUTRON_QOS_FLOATING_IP_EXTENSION: "qos-fip",
  NEUTRON_QOS_GATEWAY_IP_EXTENSION: "qos-gateway-ip",
  NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION: "router_availability_zone",
  NEUTRON_SECURITY_GROUP_EXTENSION: "security-group",
  NEUTRON_SUBNET_DNS_PUBLISH_FIXED_IP_EXTENSION: "subnet-dns-publish-fixed-ip",
  NEUTRON_UPLINK_STATUS_PROPAGATION_EXTENSION: "uplink-status-propagation",
  NEUTRON_UPLINK_STATUS_PROPAGATION_UPDATABLE_EXTENSION:
    "uplink-status-propagation-updatable",
  NEUTRON_VLAN_TRANSPARENCY_EXTENSION: "vlan-transparent",
}));

import {
  addRouterInterfaceAction,
  addRouterRouteAction,
  createFloatingIpAction,
  createNetworkAction,
  createPortAction,
  createRouterAction,
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
  updateNetworkAction,
  updateFloatingIpAction,
  updatePortAction,
  updateSubnetAction,
} from "@/lib/openstack/neutron-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("Neutron mutation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [
        "allowed-address-pairs",
        "binding",
        "dns-domain-ports",
        "dns-integration",
        "extra_dhcp_opt",
        "extraroute",
        "extraroute-atomic",
        "network_availability_zone",
        "net-mtu-writable",
        "port-hardware-offload-type",
        "port-numa-affinity-policy",
        "port-numa-affinity-policy-socket",
        "port-security",
        "port-trusted-vif",
        "qos",
        "qos-fip",
        "qos-gateway-ip",
        "router_availability_zone",
        "security-group",
        "subnet-dns-publish-fixed-ip",
        "uplink-status-propagation",
        "uplink-status-propagation-updatable",
        "vlan-transparent",
      ],
      message: "",
      serviceType: "network",
    });
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

  it("omits port security when the field is not requested", async () => {
    await createNetworkAction(scope, {
      name: "application",
      description: "Application network",
      adminStateUp: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          network: {
            name: "application",
            description: "Application network",
            admin_state_up: true,
          },
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("maps writable network MTU and create-only VLAN transparency", async () => {
    await createNetworkAction(scope, {
      name: "jumbo",
      description: "Jumbo-frame tenant network",
      adminStateUp: true,
      mtu: 9000,
      vlanTransparent: true,
    });
    await updateNetworkAction(scope, "network-a", {
      name: "jumbo",
      description: "Jumbo-frame tenant network",
      adminStateUp: true,
      mtu: 1500,
      vlanTransparent: true,
    } as never);

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          network: expect.objectContaining({
            mtu: 9000,
            vlan_transparent: true,
          }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          network: expect.objectContaining({ mtu: 1500 }),
        },
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[1]?.[0]?.body.network,
    ).not.toHaveProperty("vlan_transparent");
  });

  it("rejects unsupported network MTU and VLAN transparency requests", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const mtuResult = await createNetworkAction(scope, {
      name: "jumbo",
      description: "",
      adminStateUp: true,
      mtu: 9000,
    });
    const vlanResult = await createNetworkAction(scope, {
      name: "transparent",
      description: "",
      adminStateUp: true,
      vlanTransparent: true,
    });

    expect(mtuResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("net-mtu-writable") },
    });
    expect(vlanResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("vlan-transparent") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("validates network MTU before discovering capabilities", async () => {
    const result = await createNetworkAction(scope, {
      name: "invalid-mtu",
      description: "",
      adminStateUp: true,
      mtu: -1,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("preserves network QoS default, explicit policy, and update clearing", async () => {
    await createNetworkAction(scope, {
      name: "cloud-default",
      description: "",
      adminStateUp: true,
    });
    expect(
      mocks.executeOpenStackMutation.mock.calls.at(-1)?.[0].body.network,
    ).not.toHaveProperty("qos_policy_id");

    await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      qosPolicyId: "policy-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          network: expect.objectContaining({ qos_policy_id: "policy-a" }),
        },
      }),
    );

    await updateNetworkAction(scope, "network-a", {
      name: "application",
      description: "",
      adminStateUp: true,
      qosPolicyId: null,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          network: expect.objectContaining({ qos_policy_id: null }),
        },
      }),
    );
  });

  it("rejects a null QoS policy during network creation", async () => {
    const result = await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      qosPolicyId: null,
    } as never);

    expect(result).toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects network and port QoS without the base extension", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-security"],
      message: "",
      serviceType: "network",
    });

    const networkResult = await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      qosPolicyId: "policy-a",
    });
    const portResult = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      qosPolicyId: "policy-a",
    });

    expect(networkResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("qos") },
    });
    expect(portResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("qos") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps network DNS domains and supports clearing them", async () => {
    await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      dnsDomain: "apps.example.org.",
    });
    await updateNetworkAction(scope, "network-a", {
      name: "application",
      description: "",
      adminStateUp: true,
      dnsDomain: "",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          network: expect.objectContaining({
            dns_domain: "apps.example.org.",
          }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          network: expect.objectContaining({ dns_domain: "" }),
        },
      }),
    );
  });

  it("rejects network DNS domains without dns-integration", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-security"],
      message: "",
      serviceType: "network",
    });

    const result = await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      dnsDomain: "apps.example.org.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("dns-integration") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects malformed network DNS domains", async () => {
    const result = await createNetworkAction(scope, {
      name: "application",
      description: "",
      adminStateUp: true,
      dnsDomain: "apps.example.org",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps network availability-zone hints and checks extensions once", async () => {
    await createNetworkAction(scope, {
      name: "application",
      description: "Application network",
      adminStateUp: true,
      availabilityZoneHints: ["nova-1", "nova-1", "nova-2"],
      portSecurityEnabled: true,
    });

    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          network: expect.objectContaining({
            availability_zone_hints: ["nova-1", "nova-2"],
          }),
        },
      }),
    );
  });

  it("rejects network availability-zone hints when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-security"],
      message: "",
      serviceType: "network",
    });

    const result = await createNetworkAction(scope, {
      name: "application",
      description: "Application network",
      adminStateUp: true,
      availabilityZoneHints: ["nova"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("network_availability_zone"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps router availability-zone hints", async () => {
    await createRouterAction(scope, {
      name: "application-router",
      description: "Application routing",
      adminStateUp: true,
      availabilityZoneHints: ["nova"],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/v2.0/routers",
        body: {
          router: expect.objectContaining({
            availability_zone_hints: ["nova"],
          }),
        },
      }),
    );
  });

  it("rejects router availability-zone hints when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["network_availability_zone"],
      message: "",
      serviceType: "network",
    });

    const result = await createRouterAction(scope, {
      name: "application-router",
      description: "",
      adminStateUp: true,
      availabilityZoneHints: ["nova"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("router_availability_zone"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("preserves explicit hints when extension discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "network",
    });

    await createRouterAction(scope, {
      name: "application-router",
      description: "",
      adminStateUp: true,
      availabilityZoneHints: ["nova"],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          router: expect.objectContaining({
            availability_zone_hints: ["nova"],
          }),
        },
      }),
    );
  });

  it("rejects explicitly requested port security when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["security-group"],
      message: "",
      serviceType: "network",
    });

    const result = await createNetworkAction(scope, {
      name: "application",
      description: "Application network",
      adminStateUp: true,
      portSecurityEnabled: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("port-security"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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

  it("checks optional port extensions in one discovery request", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
      portSecurityEnabled: true,
      securityGroupIds: ["security-group-a"],
      allowedAddressPairs: [
        { ipAddress: "192.0.2.10", macAddress: "FA:16:3E:00:00:01" },
      ],
    });

    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(1);
  });

  it("maps explicit port vNIC types on create and update", async () => {
    await createPortAction(scope, {
      name: "sriov-port",
      description: "SR-IOV interface",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
    });
    await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "Return to a virtual interface",
      adminStateUp: true,
      vnicType: "normal",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ "binding:vnic_type": "direct" }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ "binding:vnic_type": "normal" }),
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(2);
  });

  it("omits default and unchanged optional port placement fields", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
    });
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "Renamed only",
      adminStateUp: true,
    });

    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body.port,
    ).not.toHaveProperty("binding:vnic_type");
    expect(
      mocks.executeOpenStackMutation.mock.calls[1]?.[0]?.body.port,
    ).not.toHaveProperty("binding:vnic_type");
    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body.port,
    ).not.toHaveProperty("hardware_offload_type");
    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body.port,
    ).not.toHaveProperty("numa_affinity_policy");
    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body.port,
    ).not.toHaveProperty("trusted");
    expect(
      mocks.executeOpenStackMutation.mock.calls[1]?.[0]?.body.port,
    ).not.toHaveProperty("numa_affinity_policy");
    expect(
      mocks.executeOpenStackMutation.mock.calls[1]?.[0]?.body.port,
    ).not.toHaveProperty("trusted");
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("rejects explicit port vNIC types when port binding is unsupported", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const createResult = await createPortAction(scope, {
      name: "sriov-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
    });
    const updateResult = await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "",
      adminStateUp: true,
      vnicType: "direct",
    });

    expect(createResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("binding") },
    });
    expect(updateResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("binding") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid port vNIC types before contacting Neutron", async () => {
    const result = await createPortAction(scope, {
      name: "invalid-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "unsupported-future-type",
    } as never);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("lets Neutron validate port vNIC types when discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "Network capability discovery failed.",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "sriov-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
    });
    await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "",
      adminStateUp: true,
      vnicType: "normal",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(2);
  });

  it("maps port placement and acceleration fields", async () => {
    await createPortAction(scope, {
      name: "accelerated-port",
      description: "Switchdev interface",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
      hardwareOffloadType: "switchdev",
      numaAffinityPolicy: "socket",
      trusted: true,
    });
    await updatePortAction(scope, "port-a", {
      name: "accelerated-port",
      description: "Relax placement and trust",
      adminStateUp: true,
      numaAffinityPolicy: null,
      trusted: false,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            "binding:vnic_type": "direct",
            hardware_offload_type: "switchdev",
            numa_affinity_policy: "socket",
            trusted: true,
          }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            numa_affinity_policy: null,
            trusted: false,
          }),
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(2);
  });

  it("accepts base NUMA policies without socket support", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-numa-affinity-policy"],
      message: "",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "numa-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      numaAffinityPolicy: "preferred",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            numa_affinity_policy: "preferred",
          }),
        },
      }),
    );
  });

  it("requires the additive extension for socket NUMA affinity", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-numa-affinity-policy"],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "numa-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      numaAffinityPolicy: "socket",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("port-numa-affinity-policy-socket"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects unsupported hardware offload and trusted VIF fields", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["binding"],
      message: "",
      serviceType: "network",
    });

    const offloadResult = await createPortAction(scope, {
      name: "offload-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
      hardwareOffloadType: "switchdev",
    });
    const trustedResult = await updatePortAction(scope, "port-a", {
      name: "trusted-port",
      description: "",
      adminStateUp: true,
      trusted: true,
    });

    expect(offloadResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("port-hardware-offload-type") },
    });
    expect(trustedResult).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("port-trusted-vif") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires port binding support for switchdev hardware offload", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-hardware-offload-type"],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "offload-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
      hardwareOffloadType: "switchdev",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("binding") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid placement values before capability discovery", async () => {
    const result = await createPortAction(scope, {
      name: "invalid-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      hardwareOffloadType: "future-offload",
      numaAffinityPolicy: "same-host",
    } as never);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires direct vNIC placement for switchdev hardware offload", async () => {
    const result = await createPortAction(scope, {
      name: "offload-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      hardwareOffloadType: "switchdev",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("direct vNIC"),
      },
    });
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("allows port placement fields when capability discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      extensions: [],
      message: "Network capability discovery is temporarily unavailable.",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "accelerated-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      vnicType: "direct",
      hardwareOffloadType: "switchdev",
      numaAffinityPolicy: "socket",
      trusted: true,
    });
    await updatePortAction(scope, "port-a", {
      name: "trusted-port",
      description: "",
      adminStateUp: true,
      numaAffinityPolicy: "required",
      trusted: false,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(2);
  });

  it("maps create and update port uplink-status propagation", async () => {
    await createPortAction(scope, {
      name: "sriov-port",
      description: "SR-IOV interface",
      networkId: "network-a",
      adminStateUp: true,
      propagateUplinkStatus: false,
    });
    await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "SR-IOV interface",
      adminStateUp: true,
      propagateUplinkStatus: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ propagate_uplink_status: false }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ propagate_uplink_status: true }),
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(2);
  });

  it("omits unchanged port uplink-status propagation", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
    });
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "Renamed only",
      adminStateUp: true,
    });

    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body.port,
    ).not.toHaveProperty("propagate_uplink_status");
    expect(
      mocks.executeOpenStackMutation.mock.calls[1]?.[0]?.body.port,
    ).not.toHaveProperty("propagate_uplink_status");
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("enforces create and update uplink-status capabilities independently", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["uplink-status-propagation"],
      message: "",
      serviceType: "network",
    });

    const createResult = await createPortAction(scope, {
      name: "sriov-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      propagateUplinkStatus: false,
    });
    const updateResult = await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "",
      adminStateUp: true,
      propagateUplinkStatus: false,
    });

    expect(createResult.ok).toBe(true);
    expect(updateResult).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("uplink-status-propagation-updatable"),
      },
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
  });

  it("rejects port uplink-status propagation when create support is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["uplink-status-propagation-updatable"],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "sriov-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      propagateUplinkStatus: false,
    });
    const updateResult = await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "",
      adminStateUp: true,
      propagateUplinkStatus: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("uplink-status-propagation"),
      },
    });
    expect(updateResult).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("uplink-status-propagation"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("lets Neutron validate uplink-status propagation when discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "Network capability discovery failed.",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "sriov-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      propagateUplinkStatus: false,
    });
    await updatePortAction(scope, "port-a", {
      name: "sriov-port",
      description: "",
      adminStateUp: true,
      propagateUplinkStatus: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(2);
  });

  it("maps allowed address pairs and omits an empty optional MAC", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
      portSecurityEnabled: true,
      allowedAddressPairs: [
        { ipAddress: "192.0.2.10", macAddress: "FA:16:3E:00:00:01" },
        { ipAddress: "2001:db8::/64", macAddress: "" },
      ],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            allowed_address_pairs: [
              {
                ip_address: "192.0.2.10",
                mac_address: "fa:16:3e:00:00:01",
              },
              { ip_address: "2001:db8::/64" },
            ],
          }),
        },
      }),
    );
  });

  it("clears allowed address pairs with an explicit empty update", async () => {
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "Application interface",
      adminStateUp: true,
      allowedAddressPairs: [],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ allowed_address_pairs: [] }),
        },
      }),
    );
  });

  it("maps and clears direct port QoS policies", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      qosPolicyId: "policy-a",
    });
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "",
      adminStateUp: true,
      qosPolicyId: null,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: { port: expect.objectContaining({ qos_policy_id: "policy-a" }) },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: { port: expect.objectContaining({ qos_policy_id: null }) },
      }),
    );
  });

  it("omits unchanged allowed address pairs from an update", async () => {
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "Application interface",
      adminStateUp: true,
    });

    const request = mocks.executeOpenStackMutation.mock.calls[0]?.[0];
    expect(request?.body.port).not.toHaveProperty("allowed_address_pairs");
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("rejects malformed and duplicate allowed address pairs", async () => {
    const malformed = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      allowedAddressPairs: [
        { ipAddress: "not-an-address", macAddress: "not-a-mac" },
      ],
    });
    const duplicate = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      allowedAddressPairs: [
        { ipAddress: "192.0.2.10", macAddress: "fa:16:3e:00:00:01" },
        { ipAddress: "192.0.2.10", macAddress: "FA:16:3E:00:00:01" },
      ],
    });

    expect(malformed).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("duplicate"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires port security for non-empty allowed address pairs", async () => {
    const result = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      portSecurityEnabled: false,
      allowedAddressPairs: [{ ipAddress: "192.0.2.10", macAddress: "" }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("port security"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects allowed address pairs when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-security"],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      portSecurityEnabled: true,
      allowedAddressPairs: [{ ipAddress: "192.0.2.10", macAddress: "" }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("allowed-address-pairs"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("lets Neutron validate address pairs when discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      allowedAddressPairs: [{ ipAddress: "192.0.2.10", macAddress: "" }],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
  });

  it("maps extra DHCP options when creating a port", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      extraDhcpOptions: [
        {
          ipVersion: 4,
          optName: "bootfile-name",
          optValue: "pxelinux.0",
        },
        { ipVersion: 6, optName: "dns-server", optValue: "2001:db8::53" },
      ],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            extra_dhcp_opts: [
              {
                ip_version: 4,
                opt_name: "bootfile-name",
                opt_value: "pxelinux.0",
              },
              {
                ip_version: 6,
                opt_name: "dns-server",
                opt_value: "2001:db8::53",
              },
            ],
          }),
        },
      }),
    );
  });

  it("maps extra DHCP option changes and explicit removals", async () => {
    await updatePortAction(scope, "port-a", {
      name: "",
      description: "",
      adminStateUp: true,
      extraDhcpOptions: [
        { ipVersion: 4, optName: "bootfile-name", optValue: "new-image" },
        { ipVersion: 6, optName: "dns-server", optValue: null },
      ],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            extra_dhcp_opts: [
              {
                ip_version: 4,
                opt_name: "bootfile-name",
                opt_value: "new-image",
              },
              {
                ip_version: 6,
                opt_name: "dns-server",
                opt_value: null,
              },
            ],
          }),
        },
      }),
    );
  });

  it("accepts blank values only for Neutron's blankable DHCP options", async () => {
    const accepted = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      extraDhcpOptions: [
        { ipVersion: 4, optName: "router", optValue: "" },
      ],
    });
    const rejected = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      extraDhcpOptions: [
        { ipVersion: 4, optName: "bootfile-name", optValue: "" },
      ],
    });

    expect(accepted.ok).toBe(true);
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "Enter an option value.",
      },
    });
  });

  it("rejects duplicate extra DHCP options for the same IP version", async () => {
    const result = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      extraDhcpOptions: [
        { ipVersion: 4, optName: "dns-server", optValue: "192.0.2.54" },
        { ipVersion: 4, optName: "dns-server", optValue: "192.0.2.55" },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("duplicate DHCP option"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects extra DHCP options when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      extraDhcpOptions: [
        {
          ipVersion: 4,
          optName: "bootfile-name",
          optValue: "pxelinux.0",
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("extra_dhcp_opt"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("omits unsupported optional security attributes from a port request", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port: {
            name: "application-port",
            description: "Application interface",
            network_id: "network-a",
            admin_state_up: true,
          },
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("rejects security group assignment when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["port-security"],
      message: "",
      serviceType: "network",
    });

    const result = await createPortAction(scope, {
      name: "application-port",
      description: "Application interface",
      networkId: "network-a",
      adminStateUp: true,
      securityGroupIds: ["security-group-a"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("security-group"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps port DNS fields and supports clearing them", async () => {
    await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      dnsName: "api",
      dnsDomain: "apps.example.org.",
    });
    await updatePortAction(scope, "port-a", {
      name: "application-port",
      description: "",
      adminStateUp: true,
      dnsName: "",
      dnsDomain: "",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({
            dns_name: "api",
            dns_domain: "apps.example.org.",
          }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          port: expect.objectContaining({ dns_name: "", dns_domain: "" }),
        },
      }),
    );
  });

  it("enforces dns-domain-ports independently from dns-integration", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["dns-integration"],
      message: "",
      serviceType: "network",
    });

    await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      dnsName: "api",
    });
    const result = await createPortAction(scope, {
      name: "application-port",
      description: "",
      networkId: "network-a",
      adminStateUp: true,
      dnsDomain: "apps.example.org.",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("dns-domain-ports") },
    });
  });

  it("validates and maps floating IP DNS records at creation time", async () => {
    await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "Public API",
      dnsName: "api",
      dnsDomain: "apps.example.org.",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          floatingip: expect.objectContaining({
            dns_name: "api",
            dns_domain: "apps.example.org.",
          }),
        },
      }),
    );

    vi.clearAllMocks();
    const incomplete = await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "",
      dnsName: "api",
    });
    const absoluteName = await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "",
      dnsName: "api.example.org.",
      dnsDomain: "apps.example.org.",
    });

    expect(incomplete).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(absoluteName).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects floating IP DNS records without dns-integration", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const result = await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "",
      dnsName: "api",
      dnsDomain: "apps.example.org.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("dns-integration") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps, clears, and independently gates floating IP QoS", async () => {
    await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "",
      qosPolicyId: "policy-a",
    });
    await updateFloatingIpAction(scope, "floating-a", {
      description: "",
      portId: null,
      fixedIpAddress: null,
      qosPolicyId: null,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          floatingip: expect.objectContaining({ qos_policy_id: "policy-a" }),
        },
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          floatingip: expect.objectContaining({ qos_policy_id: null }),
        },
      }),
    );

    vi.clearAllMocks();
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["qos"],
      message: "",
      serviceType: "network",
    });
    const result = await createFloatingIpAction(scope, {
      floatingNetworkId: "public",
      description: "",
      qosPolicyId: "policy-a",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("qos-fip") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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

  it("maps and independently gates router gateway QoS", async () => {
    await setRouterGatewayAction(scope, "router-a", {
      networkId: "external-a",
      enableSnat: true,
      qosPolicyId: "policy-a",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          router: {
            external_gateway_info: {
              network_id: "external-a",
              enable_snat: true,
              qos_policy_id: "policy-a",
            },
          },
        },
      }),
    );

    vi.clearAllMocks();
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["qos"],
      message: "",
      serviceType: "network",
    });
    const result = await setRouterGatewayAction(scope, "router-a", {
      networkId: "external-a",
      enableSnat: true,
      qosPolicyId: "policy-a",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("qos-gateway-ip") },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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

  it("rejects atomic router route mutations when Neutron only has extraroute", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["extraroute", "security-group"],
      message: "",
      serviceType: "network",
    });

    const result = await addRouterRouteAction(scope, "router-a", {
      destination: "172.20.0.0/16",
      nexthop: "10.20.30.2",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "service-unavailable",
        message: expect.stringContaining("extraroute-atomic"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("preserves router route mutations when extension discovery is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "",
      serviceType: "network",
    });

    await addRouterRouteAction(scope, "router-a", {
      destination: "172.20.0.0/16",
      nexthop: "10.20.30.2",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router-a/add_extraroutes",
      }),
    );
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

  it("maps supported subnet fixed-IP DNS publication changes", async () => {
    await createSubnetAction(scope, {
      networkId: "network-a",
      name: "public-v6",
      description: "Globally routed addresses",
      cidr: "2001:db8:42::/64",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: true,
      dnsPublishFixedIp: true,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({ dns_publish_fixed_ip: true }),
        },
      }),
    );

    await updateSubnetAction(scope, "subnet-a", {
      name: "private-v4",
      description: "Private addresses",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      disableGateway: false,
      enableDhcp: true,
      dnsPublishFixedIp: false,
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          subnet: expect.objectContaining({ dns_publish_fixed_ip: false }),
        },
      }),
    );
    expect(mocks.discoverNetworkCapabilities).toHaveBeenCalledTimes(2);
  });

  it("omits unchanged subnet DNS publication from unrelated updates", async () => {
    await updateSubnetAction(scope, "subnet-a", {
      name: "application-subnet",
      description: "Renamed only",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      disableGateway: false,
      enableDhcp: true,
    });

    const subnetRequest =
      mocks.executeOpenStackMutation.mock.calls.at(-1)?.[0].body.subnet;
    expect(subnetRequest).not.toHaveProperty("dns_publish_fixed_ip");
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("rejects subnet DNS publication when the extension is absent", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const createResult = await createSubnetAction(scope, {
      networkId: "network-a",
      name: "public-v6",
      description: "",
      cidr: "2001:db8:42::/64",
      ipVersion: 6,
      disableGateway: false,
      enableDhcp: true,
      dnsPublishFixedIp: true,
    });
    const updateResult = await updateSubnetAction(scope, "subnet-a", {
      name: "private-v4",
      description: "",
      cidr: "10.20.30.0/24",
      ipVersion: 4,
      gatewayIp: "10.20.30.1",
      disableGateway: false,
      enableDhcp: true,
      dnsPublishFixedIp: false,
    });

    expect(createResult).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("subnet-dns-publish-fixed-ip"),
      },
    });
    expect(updateResult).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("subnet-dns-publish-fixed-ip"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
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
