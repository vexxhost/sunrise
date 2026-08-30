import { describe, expect, it } from "vitest";

import {
  buildFloatingIpPortOptions,
  floatingIpPortSelectionValue,
  parseFloatingIpPortSelection,
} from "@/lib/openstack/neutron-floating-ip";
import type { Port, Server } from "@/types/openstack";

function port(
  id: string,
  deviceOwner: string,
  fixedIps: string[],
  overrides: Partial<Port> = {},
): Port {
  return {
    id,
    name: `${id}-port`,
    network_id: "private-network",
    network_name: "private",
    tenant_id: "project-a",
    project_id: "project-a",
    mac_address: "fa:16:3e:00:00:01",
    admin_state_up: true,
    status: "ACTIVE",
    device_id: `${id}-device`,
    device_owner: deviceOwner,
    fixed_ips: fixedIps.map((ipAddress) => ({
      subnet_id: "subnet-a",
      ip_address: ipAddress,
    })),
    allowed_address_pairs: [],
    extra_dhcp_opts: [],
    security_groups: [],
    description: "",
    "binding:vnic_type": "normal",
    dns_name: "",
    dns_assignment: [],
    dns_domain: "",
    port_security_enabled: true,
    qos_policy_id: null,
    qos_network_policy_id: null,
    ip_allocation: "immediate",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    revision_number: 1,
    ...overrides,
  };
}

describe("floating IP port options", () => {
  it("excludes OpenStack network plumbing and external network ports", () => {
    const options = buildFloatingIpPortOptions({
      externalNetworkIds: ["public-network"],
      ports: [
        port("router", "network:router_interface", ["10.0.0.1"]),
        port("distributed", "network:distributed", ["10.0.0.2"]),
        port("external", "", ["203.0.113.10"], {
          network_id: "public-network",
        }),
      ],
    });

    expect(options).toEqual([]);
  });

  it("labels instance, Octavia, and user-managed targets by resource type", () => {
    const instancePort = port("instance", "compute:nova", ["10.0.0.10"], {
      device_id: "server-a",
    });
    const loadBalancerPort = port("load-balancer", "Octavia", ["10.0.0.20"]);
    const customPort = port("custom", "", ["10.0.0.30"]);
    const servers = [{ id: "server-a", name: "api-server" }] as Server[];

    const options = buildFloatingIpPortOptions({
      ports: [instancePort, loadBalancerPort, customPort],
      servers,
    });

    expect(options.map(({ label }) => label)).toEqual([
      "Instance: api-server · 10.0.0.10",
      "Load balancer: load-balancer-port · 10.0.0.20",
      "Unattached port: custom-port · 10.0.0.30",
    ]);
  });

  it("offers every fixed IPv4 address separately and omits IPv6", () => {
    const options = buildFloatingIpPortOptions({
      ports: [
        port("multi-address", "compute:nova", [
          "10.0.0.10",
          "10.0.0.11",
          "2001:db8::10",
        ]),
      ],
    });

    expect(options.map(({ fixedIpAddress }) => fixedIpAddress)).toEqual([
      "10.0.0.10",
      "10.0.0.11",
    ]);
  });

  it("round-trips the selected port and fixed address", () => {
    const value = floatingIpPortSelectionValue("port-a", "10.0.0.10");
    expect(parseFloatingIpPortSelection(value)).toEqual({
      portId: "port-a",
      fixedIpAddress: "10.0.0.10",
    });
    expect(parseFloatingIpPortSelection("none")).toBeNull();
  });
});
