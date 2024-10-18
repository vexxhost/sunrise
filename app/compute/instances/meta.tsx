export interface SearchOptions {
  id: string;
  name: string;
  image: string;
  ip: string;
  ip6: string;
  flavor: string;
  key_name: string;
  status: string;
  availability_zone: string;
  "changes-since": string;
}

export const searchOptions: SearchOptions = {
  id: "Instance ID",
  name: "Instance Name",
  image: "Image ID",
  ip: "IPv4 Address",
  ip6: "IPv6 Address",
  flavor: "Flavor ID",
  key_name: "Key Pair Name",
  status: "Status",
  availability_zone: "Availability Zone",
  "changes-since": "Changes Since",
};

export const statuses: { [index: string]: string } = {
  ACTIVE: "Active",
  BUILD: "Build",
  DELETED: "Deleted",
  ERROR: "Error",
  HARD_REBOOT: "Hard Reboot",
  MIGRATING: "Migrating",
  PASSWORD: "Password",
  PAUSED: "Paused",
  REBOOT: "Reboot",
  REBUILD: "Rebuild",
  RESCUE: "Rescue",
  RESIZE: "Resize",
  REVERT_RESIZE: "Revert Resize",
  SHELVED: "Shelved",
  SHELVED_OFFLOADED: "Shelved Offloaded",
  SHUTOFF: "Shutoff",
  SOFT_DELETED: "Soft Deleted",
  SUSPENDED: "Suspended",
  UNKNOWN: "Unknown",
  VERIFY_RESIZE: "Verify Resize",
};

export const statusColorMap: { [index: string]: string } = {
  ACTIVE: "success",
  ERROR: "danger",
  BUILD: "warning",
  DELETED: "default",
  HARD_REBOOT: "default",
  MIGRATING: "default",
  PASSWORD: "default",
  PAUSED: "default",
  REBOOT: "default",
  REBUILD: "default",
  RESCUE: "default",
  RESIZE: "default",
  REVERT_RESIZE: "default",
  SHELVED: "default",
  SHELVED_OFFLOADED: "default",
  SHUTOFF: "default",
  SOFT_DELETED: "default",
  SUSPENDED: "default",
  UNKNOWN: "default",
  VERIFY_RESIZE: "default",
};

export const sortKeys = [
  "access_ip_v4",
  "access_ip_v6",
  "auto_disk_config",
  "availability_zone",
  "config_drive",
  "created_at",
  "display_description",
  "display_name",
  "host",
  "hostname",
  "image_ref",
  "instance_type_id",
  "kernel_id",
  "key_name",
  "launch_index",
  "launched_at",
  "locked",
  "locked_by",
  "node",
  "power_state",
  "progress",
  "project_id",
  "ramdisk_id",
  "root_device_name",
  "task_state",
  "terminated_at",
  "updated_at",
  "user_id",
  "uuid",
  "vm_state",
];
