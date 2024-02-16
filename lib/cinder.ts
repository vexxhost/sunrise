import { fetchProjectScopedToken } from "./keystone";

const statuses: {[key: string]: string} = {
  creating: "The volume is being created.",
  available: "The volume is ready to attach to an instance.",
  reserved: "The volume is reserved for attaching or shelved.",
  attaching: "The volume is attaching to an instance.",
  detaching: "The volume is detaching from an instance.",
  "in-use": "The volume is attached to an instance.",
  maintenance: "The volume is locked and being migrated.",
  deleting: "The volume is being deleted.",
  "awaiting-transfer": "The volume is awaiting for transfer.",
  error: "A volume creation error occurred.",
  error_deleting: "A volume deletion error occurred.",
  "backing-up": "The volume is being backed up.",
  "restoring-backup": "A backup is being restored to the volume.",
  "error_backing-up": "A backup error occurred.",
  error_restoring: "A backup restoration error occurred.",
  error_extending: "An error occurred while attempting to extend a volume.",
  downloading: "The volume is downloading an image.",
  uploading: "The volume is being uploaded to an image.",
  retyping: "The volume is changing type to another volume type.",
  extending: "The volume is being extended.",
}

export interface ListVolumesOptions {
    project_id?: string,
    sort?: string,
    sort_key?: string,
    sort_dir?: string,
    limit?: number,
    offset?: number,
    marker?: string,
    with_count?: boolean,
    created_at?: string,
    updated_at?: string,
    consumes_quota?: boolean,
}

export interface VolumeImageMetadata {
    os_distro: string,
    'owner_specified.openstack.md5': string,
    'owner_specified.openstack.object': string,
    'owner_specified.openstack.sha256': string,
    image_id: string,
    image_name: string,
    checksum: string,
    container_format: string,
    disk_format: string,
    min_disk: string,
    min_ram: string,
    size: string
}

export type Volume = {
  migration_status?: string,
  attachments: [],
  links: [],
  availability_zone?: string,
  "os-vol-host-attr:host"?: string,
  encrypted: boolean,
  encryption_key_id?: string,
  updated_at: string,
  replication_status: string,
  snapshot_id?: string,
  id: string,
  size: number,
  user_id: string,
  "os-vol-tenant-attr:tenant_id"?: string,
  "os-vol-mig-status-attr:migstat"?: string,
  metadata: object,
  status: string,
  volume_image_metadata?: VolumeImageMetadata,
  description: string,
  multiattach: boolean,
  source_volid?: string,
  consistencygroup_id: string,
  "os-vol-mig-status-attr:name_id"?: string,
  name: string,
  bootable: string,
  created_at: string,
  volumes: [],
  volume_type: string,
  volume_type_id: object,
  group_id?: string,
  volumes_links?: [],
  provider_id?: string,
  service_uuid: string,
  shared_targets: boolean,
  cluster_name?: string,
  consumes_quota?: boolean,
  count?: number,
}

export async function listVolumes(options?:ListVolumesOptions): Promise<Volume[]> {
  const response = await fetchProjectScopedToken();

  const scopedToken = response.headers.get('X-Subject-Token');

  const data = await response.json();

  // Get Volumes Detail
  const blockStorageEndpoints = data.token.catalog.find((item: {name: string}) => item.name == 'cinderv3')
  const blockStorageEndpoint = blockStorageEndpoints.endpoints.find((endpoint: {interface: string}) => endpoint.interface == 'public')

  const params = new URLSearchParams(options as {})

  const volumesResponse = await fetch(`${blockStorageEndpoint.url}/volumes/detail?${params}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": scopedToken
    } as HeadersInit,
  })

  const volumesData = await volumesResponse.json()

  return volumesData.volumes
}
