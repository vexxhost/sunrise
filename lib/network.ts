/**
 * Type definitions for Neutron (Network) API
 * All server-side functions have been moved to hooks/queries/useNetworks.ts
 */

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
