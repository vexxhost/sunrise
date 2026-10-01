import type { ResourceKind } from "@/lib/resource-preferences";

export const recoveryResourceKinds = [
  "instance",
  "flavor",
  "image",
  "key-pair",
  "volume",
  "snapshot",
  "network",
  "router",
  "port",
  "floating-ip",
  "security-group",
  "cluster",
  "cluster-template",
  "node-group",
  "bucket",
  "object",
  "share",
  "share-snapshot",
  "share-network",
  "secret",
  "secret-container",
  "secret-order",
] as const;

export type RecoveryResourceKind = (typeof recoveryResourceKinds)[number];

export type ResourceRecoveryTarget = {
  kind: RecoveryResourceKind;
  id: string;
  parentId?: string;
  mode?: "direct";
};

const recoveryKindSet = new Set<string>(recoveryResourceKinds);

const recoveryLabels: Record<RecoveryResourceKind, string> = {
  instance: "instance",
  flavor: "instance flavor",
  image: "image",
  "key-pair": "key pair",
  volume: "volume",
  snapshot: "snapshot",
  network: "network",
  router: "router",
  port: "port",
  "floating-ip": "floating IP",
  "security-group": "security group",
  cluster: "Kubernetes cluster",
  "cluster-template": "Kubernetes template",
  "node-group": "node group",
  bucket: "bucket",
  object: "object",
  share: "share",
  "share-snapshot": "share snapshot",
  "share-network": "share network",
  secret: "secret",
  "secret-container": "secret container",
  "secret-order": "key order",
};

const preferenceKinds: Partial<Record<RecoveryResourceKind, ResourceKind>> = {
  instance: "instance",
  image: "image",
  volume: "volume",
  cluster: "cluster",
  bucket: "bucket",
  share: "share",
  "share-snapshot": "share-snapshot",
  secret: "secret",
  "secret-container": "secret-container",
  "secret-order": "secret-order",
};

export function isRecoveryResourceKind(
  value: unknown,
): value is RecoveryResourceKind {
  return typeof value === "string" && recoveryKindSet.has(value);
}

export function recoveryResourceLabel(kind: RecoveryResourceKind) {
  return recoveryLabels[kind];
}

export function recoveryResourceDescription(kind: RecoveryResourceKind) {
  return kind === "bucket" || kind === "object"
    ? "It may have been removed, belong to another storage account, or no longer be visible to the current Object Storage role."
    : "It may have been removed, belong to another project or region, or no longer be visible to your account.";
}

export function recoveryPreferenceKind(kind: RecoveryResourceKind) {
  return preferenceKinds[kind];
}

export function recoveryDestination({
  kind,
  parentId,
  mode,
}: Pick<ResourceRecoveryTarget, "kind" | "parentId" | "mode">) {
  switch (kind) {
    case "instance":
      return "/compute/instances";
    case "flavor":
      return "/compute/instance-flavors";
    case "image":
      return "/compute/images";
    case "key-pair":
      return "/compute/key-pairs";
    case "volume":
      return "/compute/volumes";
    case "snapshot":
      return "/compute/snapshots";
    case "network":
      return "/compute/networks/resources";
    case "router":
      return "/compute/networks/routers";
    case "port":
      return "/compute/networks/ports";
    case "floating-ip":
      return "/compute/networks/floating-ips";
    case "security-group":
      return "/compute/networks/security-groups";
    case "cluster":
      return "/kubernetes/clusters";
    case "cluster-template":
      return "/kubernetes/templates";
    case "node-group":
      return parentId
        ? `/kubernetes/clusters/${encodeURIComponent(parentId)}/node-groups`
        : "/kubernetes/clusters";
    case "bucket":
      return "/object-storage/buckets";
    case "object":
      return parentId
        ? `/object-storage/buckets/${encodeURIComponent(parentId)}${
            mode === "direct" ? "/direct" : ""
          }`
        : "/object-storage/buckets";
    case "share":
      return "/shared-file-systems/shares";
    case "share-snapshot":
      return "/shared-file-systems/snapshots";
    case "share-network":
      return "/shared-file-systems/share-networks";
    case "secret":
      return "/key-manager/secrets";
    case "secret-container":
      return "/key-manager/containers";
    case "secret-order":
      return "/key-manager/orders";
  }
}

export function resourceRecoveryPath(target: ResourceRecoveryTarget) {
  const params = new URLSearchParams({ kind: target.kind, id: target.id });
  if (target.parentId) params.set("parentId", target.parentId);
  if (target.mode) params.set("mode", target.mode);
  return `/api/preferences/resources/recover?${params.toString()}`;
}
