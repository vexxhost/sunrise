export interface OctaviaResourceReference {
  id: string;
}

export interface OctaviaAvailabilityZone {
  name: string;
  description?: string;
  enabled: boolean;
}

export interface OctaviaLoadBalancer {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  vip_address?: string;
  vip_network_id?: string;
  vip_subnet_id?: string;
  vip_port_id?: string;
  vip_qos_policy_id?: string | null;
  vip_sg_ids?: string[];
  vip_vnic_type?: string;
  additional_vips?: Array<{
    subnet_id: string;
    ip_address?: string;
  }>;
  provider?: string;
  flavor_id?: string;
  availability_zone?: string;
  listeners?: OctaviaResourceReference[];
  pools?: OctaviaResourceReference[];
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface OctaviaListener {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  protocol: string;
  protocol_port: number;
  connection_limit?: number | null;
  timeout_client_data?: number | null;
  timeout_member_connect?: number | null;
  timeout_member_data?: number | null;
  timeout_tcp_inspect?: number | null;
  allowed_cidrs?: string[] | null;
  insert_headers?: Record<string, string> | null;
  default_pool_id?: string | null;
  loadbalancers?: OctaviaResourceReference[];
  l7policies?: OctaviaResourceReference[];
  tags?: string[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OctaviaPool {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  protocol: string;
  lb_algorithm: string;
  session_persistence?: OctaviaPoolSessionPersistence | null;
  loadbalancers?: OctaviaResourceReference[];
  listeners?: OctaviaResourceReference[];
  members?: OctaviaResourceReference[];
  healthmonitor_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tags?: string[];
}

export interface OctaviaPoolSessionPersistence {
  type: string;
  cookie_name?: string | null;
  persistence_timeout?: number | null;
  persistence_granularity?: string | null;
}

export interface OctaviaMember {
  id: string;
  name: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  address: string;
  protocol_port: number;
  subnet_id?: string;
  weight?: number;
  monitor_address?: string | null;
  monitor_port?: number | null;
  backup?: boolean;
  tags?: string[];
  pool_id: string;
}

export interface OctaviaHealthMonitor {
  id: string;
  name: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  type: string;
  delay: number;
  timeout: number;
  max_retries: number;
  max_retries_down?: number;
  url_path?: string | null;
  http_method?: string | null;
  expected_codes?: string | null;
  pools?: OctaviaResourceReference[];
  tags?: string[];
}

export interface OctaviaL7Policy {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  action: string;
  position: number;
  listener_id: string;
  redirect_pool_id?: string | null;
  redirect_url?: string | null;
  redirect_prefix?: string | null;
  rules?: OctaviaResourceReference[];
  tags?: string[];
}

export interface OctaviaL7Rule {
  id: string;
  project_id: string;
  provisioning_status: string;
  operating_status: string;
  admin_state_up: boolean;
  type: string;
  compare_type: string;
  key?: string | null;
  value: string;
  invert: boolean;
  tags?: string[];
  l7policy_id: string;
}

export interface OctaviaLoadBalancerStats {
  active_connections: number;
  bytes_in: number;
  bytes_out: number;
  request_errors: number;
  total_connections: number;
}

export interface OctaviaStatusNode {
  id: string;
  name?: string;
  provisioning_status?: string;
  operating_status?: string;
  protocol_port?: number;
  address?: string;
  listeners?: OctaviaStatusNode[];
  pools?: OctaviaStatusNode[];
  members?: OctaviaStatusNode[];
  healthmonitor?: OctaviaStatusNode;
  l7policies?: OctaviaStatusNode[];
  l7rules?: OctaviaStatusNode[];
}

export interface OctaviaLoadBalancerDetails {
  loadBalancer: OctaviaLoadBalancer;
  stats: OctaviaLoadBalancerStats | null;
  statusTree: OctaviaStatusNode | null;
  listeners: OctaviaListener[];
  pools: OctaviaPool[];
  members: OctaviaMember[];
  healthMonitors: OctaviaHealthMonitor[];
  l7Policies: OctaviaL7Policy[];
  l7Rules: OctaviaL7Rule[];
}
