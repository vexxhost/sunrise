import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const SERVER_STATUS_LABELS: Record<string, string> = {
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

const TASK_STATE_LABELS: Record<string, string> = {
  block_device_mapping: "Preparing Block Device",
  deleting: "Deleting",
  image_backup: "Creating Backup",
  image_pending_upload: "Preparing Image Upload",
  image_snapshot: "Creating Snapshot",
  image_snapshot_pending: "Preparing Snapshot",
  image_uploading: "Uploading Image",
  networking: "Configuring Network",
  pausing: "Pausing",
  powering_off: "Stopping",
  powering_on: "Starting",
  rebuilding: "Rebuilding",
  rebooting: "Rebooting",
  rebooting_hard: "Hard Rebooting",
  rescuing: "Rescuing",
  resize_confirming: "Confirming Resize",
  resize_finish: "Finishing Resize",
  resize_migrated: "Resize Migrated",
  resize_migrating: "Migrating Resize",
  resize_prep: "Preparing Resize",
  resize_reverting: "Reverting Resize",
  restoring: "Restoring",
  resuming: "Resuming",
  scheduling: "Scheduling",
  shelve: "Shelving",
  shelve_image_pending_upload: "Preparing Shelve Image Upload",
  shelve_image_uploading: "Uploading Shelve Image",
  shelving: "Shelving",
  shelving_offloading: "Shelving Offload",
  soft_deleting: "Soft Deleting",
  spawning: "Spawning",
  suspending: "Suspending",
  unpausing: "Unpausing",
  unrescuing: "Unrescuing",
  unshelving: "Unshelving",
  updating_password: "Updating Password",
};

const POWER_STATE_LABELS: Record<number, string> = {
  0: "No State",
  1: "Running",
  3: "Paused",
  4: "Shutdown",
  6: "Crashed",
  7: "Suspended",
};

function humanizeState(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeState(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function formatServerStatus(value: unknown) {
  const status = normalizeState(value);
  if (!status) {
    return "Unknown";
  }

  return SERVER_STATUS_LABELS[status.toUpperCase()] ?? humanizeState(status);
}

export function serverStatusBadgeVariant(value: unknown): BadgeVariant {
  const status = normalizeState(value).toUpperCase();

  if (status === "ACTIVE") {
    return "default";
  }

  if (status === "ERROR") {
    return "destructive";
  }

  if (
    [
      "BUILD",
      "HARD_REBOOT",
      "MIGRATING",
      "PASSWORD",
      "REBOOT",
      "REBUILD",
      "RESCUE",
      "RESIZE",
      "REVERT_RESIZE",
      "VERIFY_RESIZE",
    ].includes(status)
  ) {
    return "outline";
  }

  return "secondary";
}

export function formatServerTaskState(value: unknown) {
  const taskState = normalizeState(value);
  if (!taskState) {
    return "None";
  }

  const key = taskState.toLowerCase().replace(/-/g, "_");
  return TASK_STATE_LABELS[key] ?? humanizeState(taskState);
}

export function formatServerPowerState(value: unknown) {
  const powerState =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (Number.isNaN(powerState)) {
    return "Unknown";
  }

  return POWER_STATE_LABELS[powerState] ?? `Unknown (${powerState})`;
}
