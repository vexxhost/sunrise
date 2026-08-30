/**
 * Type definitions for Neutron (Network) API
 */

export interface SecurityGroupRule {
  id: string;
  description: string;
  security_group_id: string;
  direction: "egress" | "ingress";
  ethertype: "IPv4" | "IPv6";
  port_range_max: number | null;
  port_range_min: number | null;
  protocol: string | null;
  remote_group_id: string | null;
  remote_group_name: string | null;
  remote_ip_prefix: string | null;
  tenant_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  revision_number: number;
  tags: string[];
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
  tags: string[];
}

export interface AllocationPool {
  start: string;
  end: string;
}

export interface HostRoute {
  destination: string;
  nexthop: string;
}

export interface Subnet {
  id: string;
  name: string;
  description: string;
  network_id: string;
  tenant_id: string;
  project_id: string;
  ip_version: 4 | 6;
  cidr: string;
  gateway_ip: string | null;
  allocation_pools: AllocationPool[];
  dns_nameservers: string[];
  host_routes: HostRoute[];
  enable_dhcp: boolean;
  ipv6_address_mode: string | null;
  ipv6_ra_mode: string | null;
  subnetpool_id: string | null;
  segment_id?: string | null;
  service_types?: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  revision_number: number;
}

export interface RouterExternalGatewayInfo {
  network_id: string;
  enable_snat: boolean;
  external_fixed_ips: Array<{
    subnet_id: string;
    ip_address: string;
  }>;
}

export interface Router {
  id: string;
  name: string;
  description: string;
  status: string;
  admin_state_up: boolean;
  tenant_id: string;
  project_id: string;
  external_gateway_info: RouterExternalGatewayInfo | null;
  routes: HostRoute[];
  distributed: boolean;
  ha: boolean;
  availability_zone_hints: string[];
  availability_zones: string[];
  flavor_id?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  revision_number: number;
}

export interface FloatingIpPortDetails {
  name: string;
  network_id: string;
  mac_address: string;
  admin_state_up: boolean;
  status: string;
  device_id: string;
  device_owner: string;
}

export interface FloatingIp {
  id: string;
  description: string;
  floating_network_id: string;
  floating_ip_address: string;
  router_id: string | null;
  port_id: string | null;
  fixed_ip_address: string | null;
  tenant_id: string;
  project_id: string;
  status: string;
  dns_domain?: string;
  dns_name?: string;
  port_details?: FloatingIpPortDetails | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  revision_number: number;
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
  allowed_address_pairs: Array<{
    ip_address: string;
    mac_address: string;
  }>;
  extra_dhcp_opts: Array<{
    ip_version?: 4 | 6;
    opt_name: string;
    opt_value: string | null;
  }>;
  security_groups: string[];
  description: string;
  "binding:vnic_type": string;
  "binding:host_id"?: string;
  "binding:profile"?: Record<string, unknown>;
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
  "router:external": boolean;
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
