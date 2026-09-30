export type QuotaTone = "normal" | "warning" | "critical" | "unlimited";

export type ServiceAccent =
  | "compute"
  | "storage"
  | "network"
  | "image"
  | "kubernetes"
  | "object-storage"
  | "identity"
  | "shared-file-system"
  | "key-manager";

export const quotaToneBarClasses: Record<QuotaTone, string> = {
  normal: "bg-status-info",
  warning: "bg-status-warning",
  critical: "bg-status-danger",
  unlimited: "bg-status-success",
};

export const serviceAccentClasses: Record<ServiceAccent, string> = {
  compute: "bg-service-compute-soft text-service-compute",
  storage: "bg-service-storage-soft text-service-storage",
  network: "bg-service-network-soft text-service-network",
  image: "bg-service-image-soft text-service-image",
  kubernetes: "bg-service-kubernetes-soft text-service-kubernetes",
  "object-storage":
    "bg-service-object-storage-soft text-service-object-storage",
  identity: "bg-service-identity-soft text-service-identity",
  "shared-file-system":
    "bg-service-shared-file-system-soft text-service-shared-file-system",
  "key-manager": "bg-service-key-manager-soft text-service-key-manager",
};
