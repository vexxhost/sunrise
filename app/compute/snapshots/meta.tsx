
export const statuses: { [index: string]: string } = {
  AVAILABLE: "Available",
  CREATING: "Creating",
  DELETING: "Deleting",
  ERROR: "Error",
  ERROR_DELETING: "Error Deleting",
};

export const statusColorMap: { [index: string]: string } = {
  AVAILABLE: "success",
  CREATING: "warning",
  DELETING: "danger",
  ERROR: "danger",
  ERROR_DELETING: "danger",
};

export const sortKeys = [
  "name",
  "status",
  "size",
  "created_at",
  "volume_id",
  "description",
];

// Setup search options for snapshots to be sent to the table components filter selection
export const searchoptions : DynamicInterface = {
  id: "Snapshot ID",
  name: "Name",
  status: "Status",
  volume_id: "Volume ID",
  description: "Description",
  size: "Size",
};
