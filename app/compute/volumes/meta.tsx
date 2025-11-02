

  export const statuses: { [index: string]: string } = {
    ACTIVE: "In Use",
    BUILD: "Available",
    DELETED: "Deleting",
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
   "name",
    "availability_zone",
    "uuid",
    "size",
    "status",
    "group",
    "bootable",
    "encrypted",
    "description",
  ];

  // Setup search options for volumes to be sent to the table components filter selection
export const searchoptions : DynamicInterface = {
    id: "Volume ID",
    name: "Name",
    status: "Status",
    availability_zone: "Availability Zone",
    description: "Description",
    bootable: "Bootable",
    size: "Size",
  };
