import { describe, expect, it } from "vitest";

import { buildNetworkTopology } from "@/lib/openstack/neutron-topology";
import type {
  FloatingIp,
  Network,
  Port,
  Router,
  Server,
  Subnet,
} from "@/types/openstack";

const projectId = "project-a";

function network(id: string, options: Partial<Network> = {}): Network {
  return {
    id,
    name: id,
    project_id: projectId,
    tenant_id: projectId,
    subnets: [],
    status: "ACTIVE",
    shared: false,
    "router:external": false,
    ...options,
  } as Network;
}

function subnet(id: string, networkId: string): Subnet {
  return {
    id,
    name: id,
    project_id: projectId,
    tenant_id: projectId,
    network_id: networkId,
    cidr: "10.0.0.0/24",
    enable_dhcp: true,
  } as Subnet;
}

function port(id: string, options: Partial<Port> = {}): Port {
  return {
    id,
    name: id,
    project_id: projectId,
    tenant_id: projectId,
    network_id: "network-a",
    network_name: "application",
    device_id: "",
    device_owner: "",
    fixed_ips: [],
    status: "ACTIVE",
    ...options,
  } as Port;
}

function router(id: string): Router {
  return {
    id,
    name: id,
    project_id: projectId,
    tenant_id: projectId,
    status: "ACTIVE",
    external_gateway_info: {
      network_id: "external-used",
      enable_snat: true,
      external_fixed_ips: [],
    },
  } as unknown as Router;
}

function server(id: string): Server {
  return {
    id,
    name: id,
    tenant_id: projectId,
    status: "ACTIVE",
    addresses: {
      application: [
        {
          version: 4,
          addr: "10.0.0.10",
          "OS-EXT-IPS:type": "fixed",
          "OS-EXT-IPS-MAC:mac_addr": "fa:16:3e:00:00:01",
        },
      ],
    },
  } as unknown as Server;
}

function floatingIp(id: string): FloatingIp {
  return {
    id,
    project_id: projectId,
    tenant_id: projectId,
    floating_network_id: "external-used",
    floating_ip_address: "203.0.113.10",
    fixed_ip_address: "10.0.0.10",
    port_id: "compute-port",
    status: "ACTIVE",
  } as FloatingIp;
}

describe("network topology", () => {
  it("keeps only connected external networks as read-only context", () => {
    const topology = buildNetworkTopology({
      projectId,
      networks: [network("network-a", { subnets: ["subnet-a"] })],
      externalNetworks: [
        network("external-used", {
          project_id: "service-project",
          tenant_id: "service-project",
          "router:external": true,
        }),
        network("external-unused", {
          project_id: "service-project",
          tenant_id: "service-project",
          "router:external": true,
        }),
      ],
      subnets: [subnet("subnet-a", "network-a")],
      routers: [router("router-a")],
      ports: [],
      floatingIps: [],
      servers: [],
    });

    const used = topology.nodes.find(
      (node) => node.id === "external-network:external-used",
    );
    expect(used?.data.owned).toBe(false);
    expect(
      topology.nodes.some(
        (node) => node.id === "external-network:external-unused",
      ),
    ).toBe(false);
  });

  it("turns router interfaces into relationships instead of duplicate nodes", () => {
    const topology = buildNetworkTopology({
      projectId,
      networks: [network("network-a", { subnets: ["subnet-a"] })],
      externalNetworks: [
        network("external-used", {
          project_id: "service-project",
          tenant_id: "service-project",
          "router:external": true,
        }),
      ],
      subnets: [subnet("subnet-a", "network-a")],
      routers: [router("router-a")],
      ports: [
        port("router-port", {
          device_id: "router-a",
          device_owner: "network:router_interface_distributed",
          fixed_ips: [{ subnet_id: "subnet-a", ip_address: "10.0.0.1" }],
        }),
      ],
      floatingIps: [],
      servers: [],
    });

    expect(topology.nodes.some((node) => node.id === "port:router-port")).toBe(
      false,
    );
    expect(topology.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "router:router-a",
          target: "subnet:subnet-a",
          label: "10.0.0.1",
        }),
      ]),
    );
  });

  it("links subnets, ports, instances, and floating IP NAT", () => {
    const topology = buildNetworkTopology({
      projectId,
      networks: [network("network-a", { subnets: ["subnet-a"] })],
      externalNetworks: [
        network("external-used", {
          project_id: "service-project",
          tenant_id: "service-project",
          "router:external": true,
        }),
      ],
      subnets: [subnet("subnet-a", "network-a")],
      routers: [],
      ports: [
        port("compute-port", {
          device_id: "server-a",
          device_owner: "compute:nova",
          fixed_ips: [{ subnet_id: "subnet-a", ip_address: "10.0.0.10" }],
        }),
      ],
      floatingIps: [floatingIp("floating-a")],
      servers: [server("server-a")],
    });

    expect(topology.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "subnet:subnet-a",
          target: "port:compute-port",
        }),
        expect.objectContaining({
          source: "port:compute-port",
          target: "instance:server-a",
          label: "attached",
        }),
        expect.objectContaining({
          source: "floating-ip:floating-a",
          target: "port:compute-port",
          label: "NAT",
          dashed: true,
        }),
      ]),
    );
  });

  it("assigns every resource a distinct position in semantic columns", () => {
    const topology = buildNetworkTopology({
      projectId,
      networks: [network("network-a", { subnets: ["subnet-a"] })],
      externalNetworks: [
        network("external-used", {
          project_id: "service-project",
          tenant_id: "service-project",
          "router:external": true,
        }),
      ],
      subnets: [subnet("subnet-a", "network-a")],
      routers: [router("router-a")],
      ports: [
        port("compute-port-a", {
          device_id: "server-a",
          device_owner: "compute:nova",
          fixed_ips: [{ subnet_id: "subnet-a", ip_address: "10.0.0.10" }],
        }),
        port("compute-port-b", {
          device_id: "server-b",
          device_owner: "compute:nova",
          fixed_ips: [{ subnet_id: "subnet-a", ip_address: "10.0.0.11" }],
        }),
      ],
      floatingIps: [],
      servers: [server("server-a"), server("server-b")],
    });

    const positions = topology.nodes.map(
      (node) => `${node.position.x}:${node.position.y}`,
    );
    expect(new Set(positions).size).toBe(topology.nodes.length);

    const xFor = (id: string) =>
      topology.nodes.find((node) => node.id === id)?.position.x ?? 0;
    expect(xFor("network:network-a")).toBeLessThan(xFor("subnet:subnet-a"));
    expect(xFor("subnet:subnet-a")).toBeLessThan(xFor("port:compute-port-a"));
    expect(xFor("port:compute-port-a")).toBeLessThan(xFor("instance:server-a"));
  });
});
