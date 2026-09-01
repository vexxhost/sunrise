/**
 * Type definitions for Magnum (Container Infrastructure Management) API.
 *
 * Sunrise only surfaces Kubernetes-oriented Magnum resources. Other COEs may
 * still exist in older clouds, so the raw type remains string-compatible while
 * UI code filters to Kubernetes templates.
 */

export type MagnumClusterStatus =
  | "CREATE_IN_PROGRESS"
  | "CREATE_FAILED"
  | "CREATE_COMPLETE"
  | "UPDATE_IN_PROGRESS"
  | "UPDATE_FAILED"
  | "UPDATE_COMPLETE"
  | "DELETE_IN_PROGRESS"
  | "DELETE_FAILED"
  | "DELETE_COMPLETE"
  | "RESUME_COMPLETE"
  | "RESUME_FAILED"
  | "CHECK_COMPLETE"
  | "CHECK_FAILED"
  | "ADOPT_COMPLETE"
  | "ADOPT_FAILED"
  | "ROLLBACK_COMPLETE"
  | "ROLLBACK_FAILED"
  | "SNAPSHOT_COMPLETE"
  | "SNAPSHOT_FAILED"
  | string;

export type MagnumCOEType = "kubernetes" | "k8s_fedora" | "k8s_coreos" | string;

export type MagnumServerType = "vm" | "bm" | string;

type MagnumSortDirection = "asc" | "desc";

export interface MagnumClusterTemplateListOptions extends Record<
  string,
  unknown
> {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: MagnumSortDirection;
  name?: string;
  coe?: MagnumCOEType;
  public?: boolean;
  hidden?: boolean;
}

export interface MagnumClusterListOptions extends Record<string, unknown> {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: MagnumSortDirection;
  status?: MagnumClusterStatus;
  name?: string;
  cluster_template_id?: string;
  project_id?: string;
}

export interface MagnumClusterTemplate {
  uuid: string;
  id?: number;
  name: string;
  project_id?: string;
  user_id?: string;
  owner?: string;
  coe: MagnumCOEType;
  server_type?: MagnumServerType;
  image_id?: string;
  flavor_id?: string;
  master_flavor_id?: string;
  fixed_network?: string;
  fixed_subnet?: string;
  network_driver?: string;
  docker_volume_size?: number;
  docker_storage_driver?: string;
  volume_driver?: string;
  public?: boolean;
  registry_enabled?: boolean;
  tls_disabled?: boolean;
  insecure_registry?: string | null;
  floating_ip_enabled?: boolean;
  external_network_id?: string;
  labels?: Record<string, string>;
  dns_nameserver?: string;
  keypair_id?: string;
  apiserver_port?: number;
  master_lb_enabled?: boolean;
  http_proxy?: string | null;
  https_proxy?: string | null;
  no_proxy?: string | null;
  hidden?: boolean;
  created_at?: string;
  updated_at?: string | null;
  description?: string | null;
}

export interface MagnumClusterTemplateListResponse {
  templates?: MagnumClusterTemplate[];
  clustertemplates?: MagnumClusterTemplate[];
}

export interface MagnumClusterTemplateResponse {
  template?: MagnumClusterTemplate;
  clustertemplate?: MagnumClusterTemplate;
  uuid?: string;
}

export type MagnumKubernetesNetworkDriver = "cilium" | "calico";

export interface MagnumClusterTemplateMutationInput {
  name: string;
  imageId: string;
  kubernetesVersion: string;
  workerFlavorId: string;
  controlPlaneFlavorId: string;
  networkDriver: MagnumKubernetesNetworkDriver;
  externalNetworkId?: string;
  dnsNameserver?: string;
  fixedNetwork?: string;
  fixedSubnet?: string;
  public: boolean;
  masterLoadBalancerEnabled: boolean;
  apiFloatingIpEnabled: boolean;
  autoHealingEnabled: boolean;
  autoScalingEnabled: boolean;
  cniVersion?: string;
  ciliumHubbleUiEnabled: boolean;
  podCidr: string;
  serviceCidr: string;
  clusterDomain: string;
  fixedSubnetCidr?: string;
  apiServerFloatingIp?: string;
  apiServerCertSans?: string;
  apiServerTlsCipherSuites?: string;
  kubeletTlsCipherSuites?: string;
  admissionControlList?: string;
  availabilityZone?: string;
  controlPlaneAvailabilityZones?: string;
  differentFailureDomain: boolean;
  serverGroupPolicies?: string;
  octaviaProvider?: string;
  octaviaLbAlgorithm?: string;
  octaviaLbHealthcheck: boolean;
  apiServerLbFlavor?: string;
  apiServerLbAvailabilityZone?: string;
  bootVolumeSize?: number;
  bootVolumeType?: string;
  bootVolumeAvailabilityZone?: string;
  dockerVolumeType?: string;
  etcdVolumeSize?: number;
  etcdVolumeType?: string;
  cinderCsiEnabled: boolean;
  cinderCsiPluginTag?: string;
  manilaCsiEnabled: boolean;
  manilaCsiPluginTag?: string;
  manilaCsiShareNetworkId?: string;
  csiAttacherTag?: string;
  csiLivenessProbeTag?: string;
  csiNodeDriverRegistrarTag?: string;
  csiProvisionerTag?: string;
  csiResizerTag?: string;
  csiSnapshotterTag?: string;
  cloudProviderTag?: string;
  containerInfraPrefix?: string;
  keystoneAuthEnabled: boolean;
  auditLogEnabled: boolean;
  auditLogMaxAge?: number;
  auditLogMaxBackup?: number;
  auditLogMaxSize?: number;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcUsernameClaim?: string;
  oidcUsernamePrefix?: string;
  oidcGroupsClaim?: string;
  oidcGroupsPrefix?: string;
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
  customLabels?: Record<string, string>;
}

export interface MagnumClusterNodeGroup {
  uuid: string;
  name: string;
  cluster_id?: string;
  project_id?: string;
  role?: string;
  roles?: string[];
  status?: MagnumClusterStatus;
  status_reason?: string | null;
  node_addresses?: string[];
  node_count: number;
  min_node_count?: number;
  max_node_count?: number | null;
  is_default?: boolean;
  stack_id?: string;
  merge_labels?: boolean;
  docker_volume_size?: number;
  labels?: Record<string, string>;
  labels_overridden?: Record<string, string>;
  labels_added?: Record<string, string>;
  labels_skipped?: Record<string, string>;
  node_labels?: Record<string, string>;
  node_taints?: MagnumNodeTaint[];
  image_id?: string;
  flavor_id?: string;
  created_at?: string;
  updated_at?: string | null;
}

export type MagnumNodeTaintEffect =
  "NoSchedule" | "PreferNoSchedule" | "NoExecute";

export interface MagnumNodeTaint {
  key: string;
  effect: MagnumNodeTaintEffect;
  value?: string;
}

export interface MagnumClusterMutationInput {
  name: string;
  clusterTemplateId: string;
  networkDriver: MagnumKubernetesNetworkDriver;
  controlPlaneCount: number;
  workerCount: number;
  createTimeout: number;
  keypair?: string;
  controlPlaneFlavorId?: string;
  workerFlavorId?: string;
  fixedNetwork?: string;
  fixedSubnet?: string;
  masterLoadBalancerEnabled?: boolean;
  apiFloatingIpEnabled?: boolean;
  podCidr?: string;
  serviceCidr?: string;
  fixedSubnetCidr?: string;
  apiServerFloatingIp?: string;
  apiServerCertSans?: string;
  availabilityZone?: string;
  controlPlaneAvailabilityZones?: string;
  apiServerLbAvailabilityZone?: string;
  bootVolumeType?: string;
  bootVolumeAvailabilityZone?: string;
  manilaCsiEnabled?: boolean;
  manilaCsiShareNetworkId?: string;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcUsernameClaim?: string;
  oidcUsernamePrefix?: string;
  oidcGroupsClaim?: string;
  oidcGroupsPrefix?: string;
}

export interface MagnumClusterResizeInput {
  nodeGroup: string;
  nodeCount: number;
  role?: string;
  minNodeCount?: number;
  maxNodeCount?: number | null;
}

export interface MagnumClusterUpgradeInput {
  clusterTemplateId: string;
  maxBatchSize?: number;
}

export interface MagnumNodeGroupMutationInput {
  name: string;
  role: string;
  nodeCount: number;
  minNodeCount: number;
  maxNodeCount: number;
  flavorId?: string;
  availabilityZone?: string;
  serverGroupPolicies?: string;
}

export interface MagnumNodeGroupUpdateInput {
  autoScalingEnabled?: boolean;
  minNodeCount: number;
  maxNodeCount: number;
}

export interface MagnumClusterNodeGroupListResponse {
  nodegroups?: MagnumClusterNodeGroup[];
}

export interface MagnumClusterNodeGroupResponse {
  nodegroup?: MagnumClusterNodeGroup;
  uuid?: string;
}

export interface MagnumCluster {
  uuid: string;
  id?: number;
  project_id?: string;
  user_id?: string;
  name: string;
  status: MagnumClusterStatus;
  status_reason?: string | null;
  cluster_template_id: string;
  stack_id?: string;
  coe_version?: string;
  container_version?: string;
  api_address?: string | null;
  node_addresses?: string[];
  master_addresses?: string[];
  master_count?: number;
  node_count?: number;
  create_timeout?: number;
  discovery_url?: string | null;
  cluster_template?: MagnumClusterTemplate;
  labels?: Record<string, string>;
  flavor_id?: string;
  master_flavor_id?: string;
  docker_volume_size?: number;
  fixed_network?: string;
  fixed_subnet?: string;
  floating_ip_enabled?: boolean;
  fault?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string | null;
  keypair?: string | null;
  stack_created_at?: string | null;
  stack_updated_at?: string | null;
  health_status?: string | null;
  health_status_reason?: Record<string, string>;
  labels_overridden?: Record<string, string>;
  labels_added?: Record<string, string>;
  labels_skipped?: Record<string, string>;
  merge_labels?: boolean;
  master_lb_enabled?: boolean;
  nodegroups?: MagnumClusterNodeGroup[];
}

export interface MagnumClusterResponse {
  cluster?: MagnumCluster;
  uuid?: string;
}

export interface MagnumCertificate {
  cluster_uuid: string;
  csr?: string;
  pem: string;
  ca_cert_type?: string;
}

export interface MagnumCertificateResponse {
  certificate?: MagnumCertificate;
  cluster_uuid?: string;
  csr?: string;
  pem?: string;
  ca_cert_type?: string;
}

export interface MagnumClusterListResponse {
  clusters: MagnumCluster[];
}
