
export const sortKeys = [
  "name",
  "id",
  "vcpus",
  "ram",
  "disk",
  "OS-FLV-EXT-DATA:ephemeral",
  "os-flavor-access:is_public",
  "OS-FLV-DISABLED:disabled",
];

// Setup search options for instance types to be sent to the table components filter selection
export const searchoptions : DynamicInterface = {
  id: "ID",
  name: "Name",
  vcpus: "VCPUs",
  ram: "RAM (MB)",
  disk: "Root Disk (GB)",
};
