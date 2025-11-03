
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
