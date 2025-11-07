import type { SortDirection } from "./index";

/**
 * Magnum (Container Orchestration Engine) API type definitions.
 * Captures cluster and cluster template payloads used by Sunrise.
 *
 * NOTE: Magnum exposes many optional capabilities (e.g., quotas, trusts,
 * auto-scaling policies) that Sunrise does not yet surface. These structures
 * model the core lifecycle fields required for day-one parity while leaving
 * room to extend as we add more features.
 */

// ============================================================================
// Shared Enumerations
// ============================================================================

/**
 * Cluster provisioning states reported by Magnum.
 * @see https://docs.openstack.org/api-ref/container-infrastructure-management/
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
  | "SNAPSHOT_FAILED";

export type MagnumCOEType =
  | "kubernetes"
  | "swarm"
  | "mesos"
  | "dcos"
  | "k8s_fedora"
  | "k8s_coreos";

export type MagnumServerType = "vm" | "bm";

export type MagnumClusterAction =
  | "scale"
  | "upgrade"
  | "rotate_ca"
  | "rotate_certificate"
  | "repair";

// ============================================================================
// Query / Filter Types
// ============================================================================

export interface MagnumClusterTemplateListOptions extends Record<string, unknown> {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: SortDirection;
  name?: string;
  coe?: MagnumCOEType;
  public?: boolean;
  hidden?: boolean;
}

export interface MagnumClusterListOptions extends Record<string, unknown> {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: SortDirection;
  status?: MagnumClusterStatus;
  name?: string;
  cluster_template_id?: string;
  project_id?: string;
}

export interface MagnumClusterEventsOptions extends Record<string, unknown> {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: SortDirection;
}

// ============================================================================
// Cluster Template Types
// ============================================================================

export interface MagnumClusterTemplate {
  uuid: string;
  id?: number;
  name: string;
  coe: MagnumCOEType;
  server_type?: MagnumServerType;
  image_id: string;
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
  hidden?: boolean;
  created_at?: string;
  updated_at?: string | null;
  description?: string | null;
}

export interface MagnumClusterTemplateListResponse {
  templates: MagnumClusterTemplate[];
}

export interface MagnumClusterTemplateResponse {
  template: MagnumClusterTemplate;
}

export interface CreateClusterTemplateRequest {
  name: string;
  coe: MagnumCOEType;
  image_id: string;
  flavor_id?: string;
  master_flavor_id?: string;
  keypair_id?: string;
  external_network_id?: string;
  fixed_network?: string;
  fixed_subnet?: string;
  dns_nameserver?: string;
  docker_volume_size?: number;
  volume_driver?: string;
  network_driver?: string;
  server_type?: MagnumServerType;
  public?: boolean;
  registry_enabled?: boolean;
  tls_disabled?: boolean;
  insecure_registry?: string | null;
  floating_ip_enabled?: boolean;
  labels?: Record<string, string>;
  description?: string | null;
}

export type UpdateClusterTemplateRequest = Partial<CreateClusterTemplateRequest>;

// ============================================================================
// Cluster Types
// ============================================================================

export interface MagnumClusterNodeGroup {
  uuid: string;
  name: string;
  roles: string[];
  node_addresses?: string[];
  node_count: number;
  image_id?: string;
  flavor_id?: string;
  created_at?: string;
  updated_at?: string | null;
}

export interface MagnumCluster {
  uuid: string;
  id?: number;
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
  master_count: number;
  node_count: number;
  discovery_url?: string | null;
  cluster_template?: MagnumClusterTemplate;
  labels?: Record<string, string>;
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
  nodegroups?: MagnumClusterNodeGroup[];
}

export interface MagnumClusterResponse {
  cluster: MagnumCluster;
}

export interface MagnumClusterListResponse {
  clusters: MagnumCluster[];
}

export interface CreateClusterRequest {
  name: string;
  cluster_template_id: string;
  master_count?: number;
  node_count?: number;
  keypair?: string;
  discovery_url?: string;
  master_flavor_id?: string;
  flavor_id?: string;
  labels?: Record<string, string>;
  docker_volume_size?: number;
  fixed_network?: string;
  fixed_subnet?: string;
  floating_ip_enabled?: boolean;
  api_lb_fqdn?: string;
  nodegroups?: Array<{
    name: string;
    role: string;
    image_id?: string;
    flavor_id?: string;
    node_count: number;
    labels?: Record<string, string>;
  }>;
  timeout?: number;
}

export interface UpdateClusterRequest {
  name?: string;
  node_count?: number;
  master_count?: number;
  labels?: Record<string, string>;
  rollback?: boolean;
}

export interface MagnumActionRequest {
  cluster: {
    rollback?: boolean;
    force?: boolean;
    node_count?: number;
    nodegroup?: string;
    rotated_type?: "ca" | "cert";
    upgraded_to?: string;
  };
}

export interface MagnumCertificateRotationRequest {
  cluster_uuid: string;
}

export interface MagnumResizeRequest {
  node_count: number;
  nodes_to_remove?: string[];
}

export interface MagnumClusterEvent {
  uuid: string;
  created_at: string;
  type: string;
  message: string;
  level?: "INFO" | "WARNING" | "ERROR";
  node_uuid?: string | null;
}

export interface MagnumClusterEventsResponse {
  events: MagnumClusterEvent[];
}


