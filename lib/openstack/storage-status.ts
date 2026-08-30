const VOLUME_STATUS_LABELS: Record<string, string> = {
  "backing-up": "Backing Up",
  "error_backing-up": "Backup Error",
  "error_deleting": "Deletion Error",
  "error_extending": "Extension Error",
  "error_managing": "Management Error",
  "error_restoring": "Restore Error",
  "in-use": "In Use",
  "restoring-backup": "Restoring Backup",
  reserved: "Preparing Attachment",
};

function humanizeStatus(status: string) {
  return status
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatVolumeStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return VOLUME_STATUS_LABELS[normalized] ?? humanizeStatus(normalized);
}

export function formatSnapshotStatus(status: string) {
  return humanizeStatus(status);
}
