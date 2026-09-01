export interface ManilaShareNetworkSubnet {
  id: string;
  availability_zone?: string | null;
  neutron_net_id?: string | null;
  neutron_subnet_id?: string | null;
  cidr?: string | null;
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
}
