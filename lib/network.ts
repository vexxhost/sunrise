import { getProjectToken, getServiceEndpoint, getServiceEndpoints } from "@/lib/session";
import { log } from "console";
import exp from "constants";
import { get } from "http";
import { Endpoint } from "./keystone";

export interface SecurityGroupRule {
  id: string;
  security_group_id: string;
  direction: string;
  ethertype: string;
  port_range_max: number;
  port_range_min: number;
  protocol: string;
  remote_group_id: string;
  remote_group_name: string;
  remote_ip_prefix: string;
  tenant_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  revision_number: number;
  tags: [];
}

export interface SecurityGroup {
  id: string;
  name: string;
  description: string;
  tenant_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  revision_number: number;
  security_group_rules: SecurityGroupRule[];
  tags: [];
}

export interface Port {
  id: string;
  name: string;
  network_id: string;
  network_name: string;
  tenant_id: string;
  mac_address: string;
  admin_state_up: boolean;
  status: string;
  device_id: string;
  device_owner: string;
  fixed_ips: {
    subnet_id: string;
    ip_address: string;
  }[];
  allowed_address_pairs: any[]; // You may need to replace 'any' with a more specific type if you know the structure of this data.
  extra_dhcp_opts: any[]; // You may need to replace 'any' with a more specific type if you know the structure of this data.
  security_groups: string[];
  description: string;
  binding: {
    vnic_type: string;
  };
  dns_name: string;
  dns_assignment: {
    ip_address: string;
    hostname: string;
    fqdn: string;
  }[];
  dns_domain: string;
  port_security_enabled: boolean;
  qos_policy_id: string | null;
  qos_network_policy_id: string | null;
  ip_allocation: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  revision_number: number;
  project_id: string;
}
export interface Network {
  id: string;
  name: string;
  tenant_id: string;
  admin_state_up: boolean;
  mtu: number;
  status: string;
  subnets: string[];
  shared: boolean;
  availability_zone_hints: string[];
  availability_zones: string[];
  ipv4_address_scope: null | string;
  ipv6_address_scope: null | string;
  router: {
    external: boolean;
  };
  description: string;
  dns_domain: string;
  port_security_enabled: boolean;
  qos_policy_id: string | null;
  l2_adjacency: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  revision_number: number;
  project_id: string;
}

export async function getNetworkEndpoint() : Promise<Endpoint> {
  const services = ['network', 'neutron'];
  const endpoints = await getServiceEndpoints(services, "public");
  return endpoints[0];
}

export async function listSecurityGroups() {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const securityGroupsResponse = await fetch(
    `${endpoint.url}/v2.0/security-groups`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      } as HeadersInit,
    },
  );

  const securityGroupsData = await securityGroupsResponse.json();
  const securityGroups: SecurityGroup[] = securityGroupsData["security_groups"];
  return securityGroups;
}
// retrieve a security group by its id
export async function getSecurityGroup(id: string) {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();
  
  const securityGroupResponse = await fetch(
    `${endpoint.url}/v2.0/security-groups/${id}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      } as HeadersInit,
    },
  );

  const securityGroupData = await securityGroupResponse.json();
  const securityGroup: SecurityGroup = securityGroupData["security_group"];

  return securityGroupData;
}
// retrieve a list of security group rules
export async function listSecurityGroupRules() {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const securityGroupRules = await fetch(
    `${endpoint.url}/v2.0/security-group-rules`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      } as HeadersInit,
    },
  );

  const securityGroupRulesData = await securityGroupRules.json();

  return securityGroupRulesData;
}
// retrieve a security group rule by id
export async function getSecurityGroupRule(id: string) {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const securityGroupRuleResponse = await fetch(
    `${endpoint.url}/v2.0/security-group-rules/${id}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      } as HeadersInit,
    },
  );

  const securityGroupRuleData = await securityGroupRuleResponse.json();
  const securityGroupRule: SecurityGroupRule =
    securityGroupRuleData["security_group_rule"];

  return securityGroupRule;
}

export async function listPorts() {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const portsResponse = await fetch(`${endpoint.url}/v2.0/ports`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  const portsData = await portsResponse.json();
  const ports: Port[] = portsData["ports"];

  return ports;
}

export async function getPortById(id: string) {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const portResponse = await fetch(`${endpoint.url}/v2.0/ports/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  const portData = await portResponse.json();
  const port: Port = portData["port"];

  return port;
}

export async function getPortsByIDs(portIDs: string[]) {
  const portList = [];
  for (const portID of portIDs) {
    const port = await getPortById(portID);
    portList.push(port);
  }

  return portList;
}

export async function listNetworks() {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const networksResponse = await fetch(`${endpoint.url}/v2.0/networks`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  const networksData = await networksResponse.json();
  const networks: Network[] = networksData["networks"];

  return networks;
}

export async function getNetwork(id: string) {
  const token = await getProjectToken();
  const endpoint = await getNetworkEndpoint();

  const networkResponse = await fetch(`${endpoint.url}/v2.0/networks/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  const networkData = await networkResponse.json();
  const network: Network = networkData["network"];

  return network;
}

export async function getPortsByIdsWithNetworkName(portIDs: string[]) {
  const portList = [];
  for (const portID of portIDs) {
    const port = await getPortById(portID);
    const network = await getNetwork(port.network_id);
    port.network_name = network.name;
    portList.push(port);
  }

  return portList;
}

