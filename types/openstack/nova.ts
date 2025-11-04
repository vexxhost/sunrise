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
  flavor: { id: string; links: [] };
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
