/**
 * Type definitions for OpenStack Glance (Image Service) API v2
 * Based on https://docs.openstack.org/api-ref/image/v2/
 */

// ============================================================================
// Image Types
// ============================================================================

/**
 * Image status values
 */
export type ImageStatus =
  | "queued" // Image identifier reserved but no data uploaded
  | "saving" // Image data is being uploaded
  | "active" // Image is fully available
  | "killed" // Image data upload error occurred
  | "deleted" // Image is deleted
  | "pending_delete" // Image is pending deletion
  | "deactivated" // Image has been deactivated
  | "uploading" // Image data is being uploaded (async)
  | "importing"; // Image is being imported

/**
 * Image visibility scope
 */
export type ImageVisibility =
  | "public" // Visible to all users
  | "private" // Visible only to owner
  | "shared" // Shared with specific projects
  | "community"; // Visible to all users but not official

/**
 * Container format for the image
 */
export type ContainerFormat =
  | "ami"
  | "ari"
  | "aki"
  | "bare"
  | "ovf"
  | "ova"
  | "docker"
  | "compressed";

/**
 * Disk format for the image
 */
export type DiskFormat =
  | "ami"
  | "ari"
  | "aki"
  | "vhd"
  | "vhdx"
  | "vmdk"
  | "raw"
  | "qcow2"
  | "vdi"
  | "ploop"
  | "iso";

/**
 * Image location information
 */
export interface ImageLocation {
  url: string;
  metadata: Record<string, unknown>;
}

/**
 * Complete Image resource representation
 */
export interface Image {
  // Identifier fields
  id: string;
  name: string | null;
  owner: string | null;

  // Status and visibility
  status: ImageStatus;
  visibility: ImageVisibility;

  // Format information
  container_format: ContainerFormat | null;
  disk_format: DiskFormat | null;

  // Size information
  size: number | null; // Bytes, read-only
  virtual_size: number | null; // Bytes, read-only

  // Requirements
  min_disk: number; // GB required to boot
  min_ram: number; // MB required to boot

  // Hash/checksum information
  checksum: string | null; // MD5 hash (deprecated)
  os_hash_algo: string | null; // e.g., "sha512", read-only
  os_hash_value: string | null; // Hexdigest, read-only

  // Timestamps
  created_at: string; // ISO 8601 format, read-only
  updated_at: string; // ISO 8601 format, read-only

  // Protection and visibility
  protected: boolean; // Deletion protection
  os_hidden: boolean; // Hidden from default listings

  // Related data
  tags: string[]; // List of tags
  locations?: ImageLocation[]; // External storage URLs
  direct_url?: string; // Direct URL to external store

  // Links
  file: string; // URL to image file, read-only
  schema: string; // URL to schema, read-only
  self: string; // URL to this resource, read-only

  // Custom properties (user-defined)
  [key: string]: unknown;
}

/**
 * Request body for creating an image
 */
export interface ImageCreateRequest {
  id?: string; // Optional UUID
  name?: string;
  container_format?: ContainerFormat | null;
  disk_format?: DiskFormat | null;
  min_disk?: number;
  min_ram?: number;
  protected?: boolean;
  tags?: string[];
  visibility?: ImageVisibility;
  [key: string]: unknown; // Custom properties
}

/**
 * Request body for updating an image (JSON Patch)
 */
export interface ImagePatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

// ============================================================================
// Image Member (Sharing) Types
// ============================================================================

/**
 * Member status values
 */
export type MemberStatus =
  | "pending" // Member hasn't accepted the shared image
  | "accepted" // Member has accepted the image
  | "rejected"; // Member has rejected the image

/**
 * Image member (sharing) resource
 */
export interface ImageMember {
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
  image_id: string; // UUID of the shared image
  member_id: string; // Project/tenant ID of the consumer
  status: MemberStatus;
  schema: string; // URL to schema, read-only
}

/**
 * Request body for creating an image member
 */
export interface ImageMemberCreateRequest {
  member: string; // Project/tenant ID
}

/**
 * Request body for updating an image member
 */
export interface ImageMemberUpdateRequest {
  status: MemberStatus;
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task type values
 */
export type TaskType = "import" | "export" | "clone" | "api_image_import";

/**
 * Task status values
 */
export type TaskStatus =
  | "pending" // Task is pending execution
  | "processing" // Task is currently running
  | "success" // Task completed successfully
  | "failure"; // Task failed

/**
 * Task input for import operations
 */
export interface TaskImportInput {
  import_from: string; // Source URL
  import_from_format?: string; // e.g., "qcow2"
  image_properties?: Partial<ImageCreateRequest>;
}

/**
 * Task input for export operations
 */
export interface TaskExportInput {
  export_uuid: string; // Image ID to export
  export_to: string; // Destination URL
  export_format?: string; // e.g., "qcow2"
}

/**
 * Generic task input
 */
export type TaskInput = TaskImportInput | TaskExportInput | Record<string, unknown>;

/**
 * Task resource representation
 */
export interface Task {
  id: string; // UUID
  type: TaskType;
  status: TaskStatus;
  owner: string; // Project/tenant ID
  expires_at: string | null; // ISO 8601 format
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
  deleted_at: string | null; // ISO 8601 format
  deleted: boolean;
  input: TaskInput; // Task-specific input parameters
  result: Record<string, unknown> | null; // Task execution results
  message: string; // Status message or progress info
  image_id?: string; // Associated image UUID
  request_id?: string; // Request tracking ID
  user?: string; // User who initiated the task
  self?: string; // URL to this resource
  schema?: string; // URL to schema
}

/**
 * Request body for creating a task
 */
export interface TaskCreateRequest {
  type: TaskType;
  input: TaskInput;
}

// ============================================================================
// Metadata Definitions (Metadefs) Types
// ============================================================================

/**
 * Metadef visibility values
 */
export type MetadefVisibility = "public" | "private";

/**
 * Property data types
 */
export type PropertyType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object";

/**
 * Metadef property definition
 */
export interface MetadefProperty {
  // Core fields
  name: string; // Property identifier, max 80 chars
  title: string; // Display title
  type: PropertyType; // Property data type
  description?: string; // Detailed explanation
  default?: unknown; // Default value
  enum?: unknown[]; // Enumerated valid values
  pattern?: string; // ECMA 262 regex pattern

  // Numeric constraints
  minimum?: number; // Minimum allowed value
  maximum?: number; // Maximum allowed value
  minLength?: number; // Minimum string length
  maxLength?: number; // Maximum string length

  // Array constraints
  minItems?: number; // Minimum array length
  maxItems?: number; // Maximum array length
  uniqueItems?: boolean; // Enforce distinct values
  items?: Record<string, unknown>; // Schema for array elements
  additionalItems?: boolean; // Allow items beyond tuple schema

  // Additional fields
  readonly?: boolean; // Read-only indicator
  operators?: string[]; // Supported query operators

  // Custom properties
  [key: string]: unknown;
}

/**
 * Metadef object definition
 */
export interface MetadefObject {
  name: string; // Identifier, max 80 chars
  description?: string; // Detailed description
  properties: Record<string, MetadefProperty>; // Property definitions
  required?: string[]; // List of required property names
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
  self: string; // URL to this resource, read-only
  schema: string; // URL to schema, read-only
}

/**
 * Request body for creating a metadef object
 */
export interface MetadefObjectCreateRequest {
  name: string;
  description?: string;
  properties?: Record<string, MetadefProperty>;
  required?: string[];
}

/**
 * Metadef resource type association
 */
export interface MetadefResourceTypeAssociation {
  name: string; // Resource type identifier, max 80 chars
  prefix?: string; // Property name prefix with separator (e.g., "hw_")
  properties_target?: string; // Disambiguates multiple metadata contexts (e.g., "image")
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
}

/**
 * Request body for creating a resource type association
 */
export interface MetadefResourceTypeAssociationCreateRequest {
  name: string;
  prefix?: string;
  properties_target?: string;
}

/**
 * Metadef tag definition
 */
export interface MetadefTag {
  name: string; // Tag identifier, max 80 chars
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
}

/**
 * Request body for creating a metadef tag
 */
export interface MetadefTagCreateRequest {
  name: string;
}

/**
 * Metadef namespace definition
 */
export interface MetadefNamespace {
  // Core fields
  namespace: string; // Unique identifier, max 80 chars
  display_name?: string; // UI-friendly name, max 80 chars
  description?: string; // Namespace details, max 500 chars
  visibility: MetadefVisibility;
  protected: boolean; // Deletion protection
  owner: string; // Tenant ID of resource owner

  // Timestamps
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format

  // Links
  self: string; // URL to this resource, read-only
  schema: string; // URL to schema, read-only

  // Related collections
  properties?: Record<string, MetadefProperty>; // Property definitions
  objects?: MetadefObject[]; // Object definitions
  resource_type_associations?: MetadefResourceTypeAssociation[]; // Resource type associations
  tags?: MetadefTag[]; // Tag definitions
}

/**
 * Request body for creating a metadef namespace
 */
export interface MetadefNamespaceCreateRequest {
  namespace: string;
  display_name?: string;
  description?: string;
  visibility?: MetadefVisibility;
  protected?: boolean;
  properties?: Record<string, MetadefProperty>;
  objects?: MetadefObjectCreateRequest[];
  resource_type_associations?: MetadefResourceTypeAssociationCreateRequest[];
  tags?: MetadefTagCreateRequest[];
}

/**
 * Request body for updating a metadef namespace
 */
export interface MetadefNamespaceUpdateRequest {
  display_name?: string;
  description?: string;
  visibility?: MetadefVisibility;
  protected?: boolean;
}

/**
 * Metadef resource type
 */
export interface MetadefResourceType {
  name: string; // Resource type identifier
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
}

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Base schema structure
 */
export interface Schema {
  name: string;
  properties: Record<string, unknown>;
  additionalProperties?: Record<string, unknown>;
  links?: Array<{
    href: string;
    rel: string;
  }>;
}

/**
 * Image schema
 */
export interface ImageSchema extends Schema {
  name: "image";
}

/**
 * Images collection schema
 */
export interface ImagesSchema extends Schema {
  name: "images";
}

/**
 * Image member schema
 */
export interface MemberSchema extends Schema {
  name: "member";
}

/**
 * Image members collection schema
 */
export interface MembersSchema extends Schema {
  name: "members";
}

/**
 * Task schema
 */
export interface TaskSchema extends Schema {
  name: "task";
}

/**
 * Tasks collection schema
 */
export interface TasksSchema extends Schema {
  name: "tasks";
}

// ============================================================================
// Collection/List Response Types
// ============================================================================

/**
 * Paginated list response for images
 */
export interface ImageListResponse {
  images: Image[];
  first?: string; // Link to first page
  next?: string; // Link to next page
  schema: string; // Link to images schema
}

/**
 * List response for image members
 */
export interface ImageMemberListResponse {
  members: ImageMember[];
  schema: string; // Link to members schema
}

/**
 * List response for tasks
 */
export interface TaskListResponse {
  tasks: Task[];
  first?: string; // Link to first page
  next?: string; // Link to next page
  schema: string; // Link to tasks schema
}

/**
 * List response for metadef namespaces
 */
export interface MetadefNamespaceListResponse {
  namespaces: MetadefNamespace[];
  first?: string; // Link to first page
  next?: string; // Link to next page
  schema?: string; // Link to schema
}

/**
 * List response for metadef objects
 */
export interface MetadefObjectListResponse {
  objects: MetadefObject[];
  schema?: string; // Link to schema
}

/**
 * List response for metadef resource types
 */
export interface MetadefResourceTypeListResponse {
  resource_types: MetadefResourceType[];
  schema?: string; // Link to schema
}

/**
 * List response for metadef tags
 */
export interface MetadefTagListResponse {
  tags: MetadefTag[];
  schema?: string; // Link to schema
}

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Sort direction
 */
export type SortDirection = "asc" | "desc";

/**
 * Common query parameters for image listing
 */
export interface ImageListQueryParams {
  limit?: number; // Page size
  marker?: string; // Pagination marker (last image ID from previous page)
  name?: string; // Filter by name
  visibility?: ImageVisibility; // Filter by visibility
  member_status?: MemberStatus; // Filter by member status
  owner?: string; // Filter by owner
  status?: ImageStatus; // Filter by status
  size_min?: number; // Minimum size in bytes
  size_max?: number; // Maximum size in bytes
  protected?: boolean; // Filter by protected status
  os_hidden?: boolean; // Filter by hidden status
  tag?: string | string[]; // Filter by tags
  sort_key?: string; // Sort key (e.g., "name", "created_at", "updated_at")
  sort_dir?: SortDirection; // Sort direction
  created_at?: string; // Filter by creation date (ISO 8601 format)
  updated_at?: string; // Filter by update date (ISO 8601 format)
}

/**
 * Query parameters for task listing
 */
export interface TaskListQueryParams {
  limit?: number; // Page size
  marker?: string; // Pagination marker
  type?: TaskType; // Filter by type
  status?: TaskStatus; // Filter by status
  sort_key?: string; // Sort key
  sort_dir?: SortDirection; // Sort direction
}

/**
 * Query parameters for metadef namespace listing
 */
export interface MetadefNamespaceListQueryParams {
  limit?: number; // Page size
  marker?: string; // Pagination marker
  visibility?: MetadefVisibility; // Filter by visibility
  resource_types?: string | string[]; // Filter by resource type
  sort_key?: string; // Sort key
  sort_dir?: SortDirection; // Sort direction
}
