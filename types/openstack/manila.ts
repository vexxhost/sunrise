export interface ManilaShareNetworkSubnet {
  id: string;
  availability_zone?: string | null;
  neutron_net_id?: string | null;
  neutron_subnet_id?: string | null;
  cidr?: string | null;
  gateway?: string | null;
  ip_version?: number | null;
  mtu?: number | null;
  network_type?: string | null;
  segmentation_id?: number | null;
}

export interface ManilaShareNetwork {
  id: string;
  name?: string | null;
  description?: string | null;
  project_id?: string;
  neutron_net_id?: string | null;
  neutron_subnet_id?: string | null;
  share_network_subnets?: ManilaShareNetworkSubnet[];
  status?: string;
  security_service_update_support?: boolean;
  network_allocation_update_support?: boolean;
  created_at?: string;
  updated_at?: string | null;
}

export interface ManilaShare {
  id: string;
  name?: string | null;
  description?: string | null;
  size: number;
  status: string;
  progress?: string | null;
  share_proto: string;
  share_type?: string | null;
  share_type_name?: string | null;
  share_network_id?: string | null;
  availability_zone?: string | null;
  project_id?: string;
  user_id?: string | null;
  created_at?: string;
  snapshot_id?: string | null;
  share_group_id?: string | null;
  share_server_id?: string | null;
  host?: string | null;
  metadata?: Record<string, string>;
  is_public?: boolean;
  access_rules_status?: string | null;
  task_state?: string | null;
  snapshot_support?: boolean;
  create_share_from_snapshot_support?: boolean;
  revert_to_snapshot_support?: boolean;
  mount_snapshot_support?: boolean;
  has_replicas?: boolean;
  replication_type?: string | null;
}

export interface ManilaShareSnapshot {
  id: string;
  name?: string | null;
  description?: string | null;
  size: number;
  status: string;
  progress?: string | null;
  share_id: string;
  share_name?: string | null;
  share_proto?: string | null;
  share_size?: number | null;
  project_id?: string;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
  provider_location?: string | null;
}

export interface ManilaShareType {
  id: string;
  name: string;
  description?: string | null;
  is_public?: boolean;
  is_default?: boolean;
  extra_specs?: Record<string, string>;
  required_extra_specs?: Record<string, string>;
}

export interface ManilaAvailabilityZone {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ManilaExportLocation {
  id: string;
  path: string;
  preferred?: boolean;
}

export interface ManilaShareAccessRule {
  id: string;
  share_id?: string;
  access_type: "ip" | "cert" | "user" | string;
  access_to: string;
  access_level: "rw" | "ro" | string;
  access_key?: string | null;
  state: string;
  created_at?: string;
  updated_at?: string | null;
  metadata?: Record<string, string>;
}
