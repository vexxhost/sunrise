/**
 * Type definitions for OpenStack Nova (Compute Service) API
 * Based on https://docs.openstack.org/api-ref/compute/
 */

import { SecurityGroup } from "./neutron";
import type { SortDirection } from "./index";

// ============================================================================
// Flavor Types
// ============================================================================

/**
 * Link resource representation
 */
export interface Link {
  href: string; // URL to the resource
  rel: string; // Relationship type (e.g., "self", "bookmark")
}

/**
 * Complete Flavor resource representation
 */
export interface Flavor {
  // Identifier fields
  id: string; // UUID or integer ID
  name: string; // Flavor name
  description?: string | null; // Flavor description (v2.55+)

  // Compute resources
  vcpus: number; // Number of virtual CPUs
  ram: number; // Memory in MB
  disk: number; // Root disk size in GB

  // Optional disk resources
  "OS-FLV-EXT-DATA:ephemeral": number; // Ephemeral disk size in GB
  swap: number | string; // Swap space in MB (can be "" for 0)

  // Network
  rxtx_factor: number; // RX/TX factor for bandwidth (deprecated)

  // Visibility and state
  "os-flavor-access:is_public": boolean; // Whether flavor is public
  "OS-FLV-DISABLED:disabled": boolean; // Whether flavor is disabled

  // Links
  links: Link[]; // Resource links

  // Extra specifications (v2.61+)
  extra_specs?: Record<string, string>; // Additional flavor metadata
}

/**
 * Request body for creating a flavor
 */
export interface FlavorCreateRequest {
  name: string; // Required
  ram: number; // Required, in MB
  vcpus: number; // Required
  disk: number; // Required, in GB
  id?: string; // Optional UUID or integer
  description?: string; // Optional (v2.55+)
  ephemeral?: number; // Optional, in GB, defaults to 0
  swap?: number; // Optional, in MB, defaults to 0
  rxtx_factor?: number; // Optional, defaults to 1.0
  is_public?: boolean; // Optional, defaults to true
}

/**
 * Request body for updating a flavor (v2.55+)
 */
export interface FlavorUpdateRequest {
  description: string | null; // Update or clear description
}

/**
 * Single flavor response
 * Nova API wraps single flavor in a "flavor" property
 */
export interface FlavorResponse {
  flavor: Flavor;
}

/**
 * Paginated list response for flavors
 */
export interface FlavorListResponse {
  flavors: Flavor[];
  flavors_links?: Link[]; // Pagination links
}

// ============================================================================
// Server Types
// ============================================================================

export interface InterfaceAttachment {
  net_id: string;
  port_id: string;
  mac_addr: string;
  port_state: string;
  fixed_ips: {
    subnet_id: string;
    ip_address: string;
  }[];
}

export interface InterfaceAttachmentsResponse {
  interfaceAttachments: InterfaceAttachment[];
}

export interface AddressItem {
  version: number;
  addr: string;
  "OS-EXT-IPS:type": string;
  "OS-EXT-IPS-MAC:mac_addr": string;
}

export interface Server {
  id: number;
  name: string;
  status: string;
  tenant_id: string;
  user_id: string;
  metadata: {};
  hostId: string;
  image: { id: string } | "";
  flavor: {
    vcpus: number;
    ram: number;
    disk: number;
    ephemeral: number;
    swap: number;
    original_name: string;
    extra_specs?: Record<string, string>;
  };
  created: string;
  updated: string;
  addresses: { [key: string]: AddressItem[] };
  accessIPv4: string;
  accessIPv6: string;
  links: Link[];
  "OS-DCF:diskConfig": string;
  progress: number;
  "OS-EXT-AZ:availability_zone": string;
  config_drive: string;
  key_name: string;
  "OS-SRV-USG:launched_at": string;
  "OS-SRV-USG:terminated_at"?: string;
  "OS-EXT-STS:task_state"?: string;
  "OS-EXT-STS:vm_state"?: string;
  "OS-EXT-STS:power_state": number;
  "os-extended-volumes:volumes_attached": { id: string }[];
  security_groups: SecurityGroup[];
  locked: boolean;
}

/**
 * Server action event (per Nova os-instance-actions/{request_id})
 */
export interface ServerActionEvent {
  event: string;
  start_time: string | null;
  finish_time: string | null;
  result: string | null;
  traceback?: string | null;
  host?: string | null;
  hostId?: string | null;
  details?: string | null;
}

/**
 * Server action summary (per Nova os-instance-actions list)
 */
export interface ServerAction {
  action: string;
  instance_uuid: string;
  request_id: string;
  user_id: string | null;
  project_id: string | null;
  start_time: string;
  message: string | null;
  updated_at?: string | null;
  events?: ServerActionEvent[];
}

export interface ServerActionsListResponse {
  instanceActions: ServerAction[];
}

export interface ServerActionResponse {
  instanceAction: ServerAction;
}

export interface ServerConsoleOutputResponse {
  output: string;
}

/**
 * Single server response
 * Nova API wraps single server in a "server" property
 */
export interface ServerResponse {
  server: Server;
}

/**
 * List servers response
 */
export interface ServerListResponse {
  servers: Server[];
  servers_links?: Link[]; // Pagination links
}

// ============================================================================
// Query/Filter Types
// ============================================================================

export interface ListServersOptions {
  availability_zone?: string;
  changes_since?: string;
  created_at?: string;
  deleted?: boolean;
  flavor?: string;
  host?: string;
  hostname?: string;
  image?: string;
  ip?: string;
  ip6?: string;
  kernel_id?: string;
  key_name?: string;
  launch_index?: string;
  launched_at?: string;
  limit?: number;
  locked_by?: string;
  marker?: string;
  name?: string;
  node?: string;
  power_state?: number;
  progress?: number;
  reservation_id?: string;
  root_device_name?: string;
  soft_deleted?: boolean;
  sort_dir?: string;
  sort_key?: string;
  status?: string;
  task_state?: string;
  terminated_at?: string;
  user_id?: string;
  uuid?: string;
  vm_state?: string;
  not_tags?: string;
  not_tags_any?: string;
  tags?: string;
  tags_any?: string;
  changes_before?: string;
  locked?: boolean;
}

/**
 * Common query parameters for flavor listing
 */
export interface ListFlavorsOptions {
  sort_key?: string; // Sort key (e.g., "name", "created_at", "memory_mb")
  sort_dir?: SortDirection; // Sort direction
  limit?: number; // Page size
  marker?: string; // Pagination marker (last flavor ID from previous page)
  minDisk?: number; // Minimum disk in GB
  minRam?: number; // Minimum RAM in MB
  is_public?: boolean | string; // Filter by public/private (true, false, or "none" for all)
}

// ============================================================================
// Keypair Types
// ============================================================================

/**
 * Keypair type values
 */
export type KeypairType = "ssh" | "x509";

/**
 * Complete Keypair resource representation
 */
export interface Keypair {
  // Identifier fields
  name: string; // Keypair name
  user_id?: string; // Owner user ID (v2.10+, admin-accessible)

  // Key data
  public_key: string; // Public key material
  private_key?: string; // Private key (only returned on creation, never on get/list)
  fingerprint: string; // Key fingerprint hash

  // Type information (v2.2+)
  type: KeypairType; // SSH or X509

  // Timestamps (internal, may be removed in future)
  created_at?: string; // Creation timestamp
  deleted?: boolean; // Soft delete flag (internal)
  deleted_at?: string | null; // Deletion timestamp (internal)
  updated_at?: string | null; // Last update timestamp (internal)

  // Custom properties
  [key: string]: unknown;
}

/**
 * Request body for creating/importing a keypair
 */
export interface KeypairCreateRequest {
  name: string; // Required
  public_key: string; // Required (v2.92+)
  type?: KeypairType; // Optional, defaults to "ssh"
  user_id?: string; // Optional, admin only (v2.10+)
}

/**
 * Single keypair response
 * Nova API wraps single keypair in a "keypair" property
 */
export interface KeypairResponse {
  keypair: Keypair;
}

/**
 * List keypairs response
 */
export interface KeypairListResponse {
  keypairs: Array<{ keypair: Keypair }>; // Each item is wrapped in "keypair" object
  keypairs_links?: Link[]; // Pagination links (v2.35+)
}

/**
 * Common query parameters for keypair listing
 */
export interface ListKeypairsOptions {
  limit?: number; // Page size (v2.35+)
  marker?: string; // Pagination marker (v2.35+)
  user_id?: string; // Filter by user ID (admin only, v2.10+)
}

// ============================================================================
// Server Action / Lifecycle Request Types
// ============================================================================

export type VncConsoleType = "novnc" | "xvpvnc";

export interface ServerConsole {
  type: string;
  url: string;
}

export interface ServerNetworkRequest {
  uuid?: string;
  port?: string;
  fixed_ip?: string;
  tag?: string;
}

export interface ServerSecurityGroupRequest {
  name: string;
}

export interface ServerBlockDeviceMapping {
  uuid?: string;
  source_type: "volume" | "snapshot" | "image" | "blank";
  destination_type?: "volume" | "local";
  boot_index?: number;
  volume_size?: number;
  delete_on_termination?: boolean;
  device_name?: string;
  guest_format?: string;
  tag?: string;
}

export interface CreateServerRequest {
  name: string;
  flavorRef: string;
  imageRef?: string;
  key_name?: string;
  networks?: ServerNetworkRequest[] | "auto" | "none";
  security_groups?: ServerSecurityGroupRequest[];
  availability_zone?: string;
  metadata?: Record<string, string>;
  user_data?: string;
  config_drive?: boolean;
  block_device_mapping_v2?: ServerBlockDeviceMapping[];
  min_count?: number;
  max_count?: number;
  [key: string]: unknown;
}

export interface RebuildServerRequest {
  imageRef: string;
  name?: string;
  adminPass?: string;
  metadata?: Record<string, string>;
  preserve_ephemeral?: boolean;
  description?: string | null;
  key_name?: string | null;
  user_data?: string | null;
  [key: string]: unknown;
}

export interface ResizeServerRequest {
  flavorRef: string;
  [key: string]: unknown;
}

export interface MigrateServerRequest {
  host?: string;
  [key: string]: unknown;
}

export interface LiveMigrateServerRequest {
  host?: string | null;
  block_migration?: boolean | "auto";
  disk_over_commit?: boolean;
  force?: boolean;
  [key: string]: unknown;
}

export interface RescueServerRequest {
  adminPass?: string;
  rescue_image_ref?: string;
  [key: string]: unknown;
}

export interface CreateServerImageRequest {
  name: string;
  metadata?: Record<string, string>;
}
