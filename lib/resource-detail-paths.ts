const detailPaths = {
  instance: "/compute/instances",
  "instance-flavor": "/compute/instance-flavors",
  "instance-snapshot": "/compute/snapshots",
  image: "/compute/images",
  volume: "/compute/volumes",
  cluster: "/kubernetes/clusters",
  "cluster-template": "/kubernetes/templates",
  "load-balancer": "/networking/load-balancers",
  network: "/networking/networks",
  router: "/networking/routers",
  port: "/networking/ports",
  "floating-ip": "/networking/floating-ips",
  "security-group": "/networking/security-groups",
  "address-group": "/networking/address-groups",
  bucket: "/object-storage/buckets",
  share: "/shared-file-systems/shares",
  "share-snapshot": "/shared-file-systems/snapshots",
  "share-network": "/shared-file-systems/share-networks",
  "security-service": "/shared-file-systems/security-services",
  "user-message": "/shared-file-systems/user-messages",
  secret: "/key-manager/secrets",
  "secret-container": "/key-manager/containers",
  "secret-order": "/key-manager/orders",
  "application-credential": "/identity/application-credentials",
} as const;

export type ResourceDetailKind = keyof typeof detailPaths;

export function resourceDetailHref(kind: ResourceDetailKind, id: string) {
  const url = `${detailPaths[kind]}/${encodeURIComponent(id)}`;
  return kind === "instance" || kind === "cluster" ? `${url}/overview` : url;
}
