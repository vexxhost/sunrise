import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import type { ServiceDirectoryId } from "@/lib/openstack/service-directory";
import type { CreateActionId } from "@/lib/create-actions";
import {
  defaultServicePolicy,
  enabledObjectStorageBackends,
  isServiceEnabled,
  type OpenStackServiceId,
  type ObjectStorageBackend,
  type ServicePolicy,
} from "@/lib/service-policy";

export const MAX_FAVORITE_DESTINATIONS = 12;

export type NavigationDestinationId =
  | "compute.instances"
  | "compute.flavors"
  | "compute.images"
  | "compute.key-pairs"
  | "compute.volumes"
  | "compute.snapshots"
  | "networking.networks"
  | "networking.topology"
  | "networking.routers"
  | "networking.ports"
  | "networking.floating-ips"
  | "networking.security-groups"
  | "kubernetes.clusters"
  | "kubernetes.templates"
  | "object-storage.buckets"
  | "object-storage.roles"
  | "identity.application-credentials"
  | "shared-file-system.shares"
  | "shared-file-system.snapshots"
  | "shared-file-system.share-networks"
  | "shared-file-system.security-services"
  | "key-manager.secrets"
  | "key-manager.containers"
  | "key-manager.orders"
  | "key-manager.secret-stores";

export type NavigationDestinationIcon =
  | "application-credential"
  | "bucket"
  | "cluster"
  | "cluster-template"
  | "container"
  | "flavor"
  | "floating-ip"
  | "image"
  | "instance"
  | "key-pair"
  | "network"
  | "order"
  | "port"
  | "role"
  | "router"
  | "secret"
  | "secret-store"
  | "security-group"
  | "security-service"
  | "share"
  | "share-network"
  | "snapshot"
  | "topology"
  | "volume";

export type NavigationDestinationStatus =
  "available" | "unavailable" | "unknown";

export type NavigationDestination = {
  id: NavigationDestinationId;
  label: string;
  description: string;
  href: string;
  service: ServiceDirectoryId;
  group: string;
  icon: NavigationDestinationIcon;
  keywords: string[];
  status: NavigationDestinationStatus;
  message: string;
};

type CatalogIdentity = {
  serviceType: string;
  serviceName: string;
};

type NavigationDestinationDefinition = Omit<
  NavigationDestination,
  "status" | "message"
> & {
  policyService: OpenStackServiceId;
  catalogIdentities: CatalogIdentity[];
  objectStorageBackend?: ObjectStorageBackend;
};

const nova = [{ serviceType: "compute", serviceName: "nova" }];
const glance = [{ serviceType: "image", serviceName: "glance" }];
const cinder = [
  { serviceType: "volumev3", serviceName: "cinderv3" },
  { serviceType: "volumev3", serviceName: "cinder" },
];
const neutron = [{ serviceType: "network", serviceName: "neutron" }];
const magnum = [
  { serviceType: "container-infra", serviceName: "magnum" },
  { serviceType: "container-infrastructure", serviceName: "magnum" },
  {
    serviceType: "container-infrastructure-management",
    serviceName: "magnum",
  },
];
const s3 = [{ serviceType: "object-storage-s3", serviceName: "s3" }];
const keystone = [{ serviceType: "identity", serviceName: "keystone" }];
const manila = [
  { serviceType: "sharev2", serviceName: "manilav2" },
  { serviceType: "share", serviceName: "manila" },
];
const barbican = [{ serviceType: "key-manager", serviceName: "barbican" }];

const definitions: NavigationDestinationDefinition[] = [
  {
    id: "compute.instances",
    label: "Instances",
    description: "Virtual machines in the active project.",
    href: "/compute/instances",
    service: "compute",
    policyService: "compute",
    group: "Compute",
    icon: "instance",
    keywords: ["servers", "virtual machines", "vm", "ec2", "compute engine"],
    catalogIdentities: nova,
  },
  {
    id: "compute.flavors",
    label: "Instance flavors",
    description: "CPU, memory, and disk profiles for instances.",
    href: "/compute/instance-flavors",
    service: "compute",
    policyService: "compute",
    group: "Compute",
    icon: "flavor",
    keywords: ["sizes", "machine types", "instance types", "nova flavors"],
    catalogIdentities: nova,
  },
  {
    id: "compute.images",
    label: "Images",
    description: "Bootable operating-system and appliance images.",
    href: "/compute/images",
    service: "compute",
    policyService: "image",
    group: "Compute",
    icon: "image",
    keywords: ["glance", "ami", "boot images", "machine images"],
    catalogIdentities: glance,
  },
  {
    id: "compute.key-pairs",
    label: "Key pairs",
    description: "SSH public keys used to access instances.",
    href: "/compute/key-pairs",
    service: "compute",
    policyService: "compute",
    group: "Compute",
    icon: "key-pair",
    keywords: ["ssh", "public keys", "credentials"],
    catalogIdentities: nova,
  },
  {
    id: "compute.volumes",
    label: "Volumes",
    description: "Persistent block-storage disks.",
    href: "/compute/volumes",
    service: "compute",
    policyService: "volume",
    group: "Block storage",
    icon: "volume",
    keywords: ["cinder", "disks", "block storage", "ebs"],
    catalogIdentities: cinder,
  },
  {
    id: "compute.snapshots",
    label: "Volume snapshots",
    description: "Point-in-time copies of block-storage volumes.",
    href: "/compute/snapshots",
    service: "compute",
    policyService: "volume",
    group: "Block storage",
    icon: "snapshot",
    keywords: ["cinder", "backups", "disk snapshots"],
    catalogIdentities: cinder,
  },
  {
    id: "networking.networks",
    label: "Networks",
    description: "Project networks and their subnets.",
    href: "/networking/networks",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "network",
    keywords: ["neutron", "vpc", "subnets", "private networks"],
    catalogIdentities: neutron,
  },
  {
    id: "networking.topology",
    label: "Network topology",
    description: "Interactive map of project network relationships.",
    href: "/networking/topology",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "topology",
    keywords: ["neutron", "map", "diagram", "visualizer"],
    catalogIdentities: neutron,
  },
  {
    id: "networking.routers",
    label: "Routers",
    description: "Connect project subnets and external gateways.",
    href: "/networking/routers",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "router",
    keywords: ["neutron", "gateway", "routing", "vpc router"],
    catalogIdentities: neutron,
  },
  {
    id: "networking.ports",
    label: "Ports",
    description: "Virtual network interfaces and addresses.",
    href: "/networking/ports",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "port",
    keywords: ["neutron", "interfaces", "nic", "network adapters"],
    catalogIdentities: neutron,
  },
  {
    id: "networking.floating-ips",
    label: "Floating IPs",
    description: "Public addresses allocated to project resources.",
    href: "/networking/floating-ips",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "floating-ip",
    keywords: ["neutron", "public ip", "elastic ip", "eip"],
    catalogIdentities: neutron,
  },
  {
    id: "networking.security-groups",
    label: "Security groups",
    description: "Stateful firewall policies for project resources.",
    href: "/networking/security-groups",
    service: "networking",
    policyService: "network",
    group: "Networking",
    icon: "security-group",
    keywords: ["neutron", "firewall", "rules", "network acl"],
    catalogIdentities: neutron,
  },
  {
    id: "kubernetes.clusters",
    label: "Kubernetes clusters",
    description: "Magnum-backed Kubernetes control planes and node groups.",
    href: "/kubernetes/clusters",
    service: "kubernetes",
    policyService: "container-infra",
    group: "Kubernetes",
    icon: "cluster",
    keywords: ["magnum", "k8s", "eks", "gke", "aks", "capi"],
    catalogIdentities: magnum,
  },
  {
    id: "kubernetes.templates",
    label: "Cluster templates",
    description: "Reusable Kubernetes infrastructure defaults.",
    href: "/kubernetes/templates",
    service: "kubernetes",
    policyService: "container-infra",
    group: "Kubernetes",
    icon: "cluster-template",
    keywords: ["magnum", "k8s", "capi", "node image"],
    catalogIdentities: magnum,
  },
  {
    id: "object-storage.buckets",
    label: "Buckets",
    description: "S3-compatible buckets and objects.",
    href: "/object-storage/buckets",
    service: "object-storage",
    policyService: "object-storage-s3",
    group: "Object Storage",
    icon: "bucket",
    keywords: ["s3", "rgw", "object storage", "blob storage"],
    catalogIdentities: s3,
    objectStorageBackend: "s3",
  },
  {
    id: "object-storage.roles",
    label: "Object Storage roles",
    description: "IAM roles in the active RGW account.",
    href: "/object-storage/roles",
    service: "object-storage",
    policyService: "object-storage-s3",
    group: "Object Storage",
    icon: "role",
    keywords: ["s3", "rgw", "iam", "access roles", "sts"],
    catalogIdentities: s3,
    objectStorageBackend: "s3",
  },
  {
    id: "identity.application-credentials",
    label: "Application credentials",
    description: "Project-scoped credentials for automation.",
    href: "/identity/application-credentials",
    service: "identity",
    policyService: "identity",
    group: "Identity",
    icon: "application-credential",
    keywords: ["keystone", "api credentials", "automation", "service account"],
    catalogIdentities: keystone,
  },
  {
    id: "shared-file-system.shares",
    label: "Shares",
    description: "Mountable shared file systems.",
    href: "/shared-file-systems/shares",
    service: "shared-file-system",
    policyService: "share",
    group: "Shared File System",
    icon: "share",
    keywords: ["manila", "nfs", "shared storage", "file shares"],
    catalogIdentities: manila,
  },
  {
    id: "shared-file-system.snapshots",
    label: "Share snapshots",
    description: "Point-in-time copies of shared file systems.",
    href: "/shared-file-systems/snapshots",
    service: "shared-file-system",
    policyService: "share",
    group: "Shared File System",
    icon: "snapshot",
    keywords: ["manila", "nfs", "share snapshot", "backup"],
    catalogIdentities: manila,
  },
  {
    id: "shared-file-system.share-networks",
    label: "Share networks",
    description: "Network context used by shared file systems.",
    href: "/shared-file-systems/share-networks",
    service: "shared-file-system",
    policyService: "share",
    group: "Shared File System",
    icon: "share-network",
    keywords: ["manila", "nfs", "share network", "subnet"],
    catalogIdentities: manila,
  },
  {
    id: "shared-file-system.security-services",
    label: "Security services",
    description: "Directory authentication for Manila share servers.",
    href: "/shared-file-systems/security-services",
    service: "shared-file-system",
    policyService: "share",
    group: "Shared File System",
    icon: "security-service",
    keywords: ["manila", "ldap", "kerberos", "active directory"],
    catalogIdentities: manila,
  },
  {
    id: "key-manager.secrets",
    label: "Secrets",
    description: "Encrypted keys, certificates, and protected values.",
    href: "/key-manager/secrets",
    service: "key-manager",
    policyService: "key-manager",
    group: "Key Manager",
    icon: "secret",
    keywords: ["barbican", "key vault", "secret manager", "kms"],
    catalogIdentities: barbican,
  },
  {
    id: "key-manager.containers",
    label: "Secret containers",
    description: "Typed groups of related secrets.",
    href: "/key-manager/containers",
    service: "key-manager",
    policyService: "key-manager",
    group: "Key Manager",
    icon: "container",
    keywords: ["barbican", "certificates", "secret groups"],
    catalogIdentities: barbican,
  },
  {
    id: "key-manager.orders",
    label: "Secret orders",
    description: "Server-side key and certificate generation requests.",
    href: "/key-manager/orders",
    service: "key-manager",
    policyService: "key-manager",
    group: "Key Manager",
    icon: "order",
    keywords: ["barbican", "generate key", "certificate request"],
    catalogIdentities: barbican,
  },
  {
    id: "key-manager.secret-stores",
    label: "Secret stores",
    description: "Available Key Manager storage backends.",
    href: "/key-manager/secret-stores",
    service: "key-manager",
    policyService: "key-manager",
    group: "Key Manager",
    icon: "secret-store",
    keywords: ["barbican", "backends", "plugins", "vault"],
    catalogIdentities: barbican,
  },
];

const definitionIds = new Set<NavigationDestinationId>(
  definitions.map(({ id }) => id),
);

const legacyDestinationIds: Record<string, NavigationDestinationId> = {
  "compute.networks": "networking.networks",
  "compute.topology": "networking.topology",
  "compute.routers": "networking.routers",
  "compute.ports": "networking.ports",
  "compute.floating-ips": "networking.floating-ips",
  "compute.security-groups": "networking.security-groups",
};

export const serviceDirectorySearchTerms: Record<ServiceDirectoryId, string[]> =
  {
    compute: ["nova", "glance", "cinder", "virtual machines"],
    networking: ["neutron", "networks", "routers", "ports", "firewall"],
    kubernetes: ["magnum", "k8s", "capi", "containers"],
    "object-storage": [
      "s3",
      "rgw",
      "swift",
      "buckets",
      "containers",
      "objects",
      "iam",
    ],
    identity: ["keystone", "application credentials", "access"],
    orchestration: ["heat", "stacks", "infrastructure as code"],
    dns: ["designate", "zones", "records"],
    "shared-file-system": ["manila", "nfs", "shares"],
    "key-manager": ["barbican", "secrets", "certificates", "kms"],
  };

export const createActionSearchTerms: Record<CreateActionId, string[]> = {
  instance: ["server", "virtual machine", "vm", "ec2"],
  image: ["glance", "boot image", "machine image", "ami"],
  volume: ["cinder", "disk", "block storage", "ebs"],
  snapshot: ["cinder", "disk copy", "backup"],
  network: ["neutron", "vpc", "subnet"],
  router: ["neutron", "gateway", "routing"],
  port: ["neutron", "interface", "nic"],
  "floating-ip": ["neutron", "public ip", "elastic ip", "eip"],
  "security-group": ["neutron", "firewall", "rules"],
  "key-pair": ["ssh", "public key"],
  cluster: ["magnum", "kubernetes", "k8s", "capi"],
  "cluster-template": ["magnum", "kubernetes", "k8s", "capi"],
  bucket: ["s3", "rgw", "object storage"],
  role: ["s3", "rgw", "iam", "sts"],
  "application-credential": ["keystone", "api credential", "automation"],
  share: ["manila", "nfs", "shared file system"],
  "share-network": ["manila", "neutron", "nfs", "share network"],
  "share-snapshot": ["manila", "nfs", "share snapshot", "backup"],
  "security-service": ["manila", "ldap", "kerberos", "active directory"],
  secret: ["barbican", "key vault", "secret manager", "kms"],
  "secret-container": ["barbican", "certificate", "secret group"],
  "secret-order": ["barbican", "generate key", "certificate request"],
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function commandPaletteFilter(value: string, search: string) {
  const query = normalizeSearchText(search).trim();
  if (!query) return 1;

  const haystack = normalizeSearchText(value);
  const tokens = query.split(/\s+/);
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  if (haystack.startsWith(query)) return 1;

  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.every((token) => words.some((word) => word.startsWith(token)))) {
    return 0.9;
  }
  return 0.7;
}

export function isNavigationDestinationId(
  value: unknown,
): value is NavigationDestinationId {
  return (
    typeof value === "string" &&
    definitionIds.has(value as NavigationDestinationId)
  );
}

export function parseFavoriteDestinationIds(
  value: unknown,
): NavigationDestinationId[] {
  if (!Array.isArray(value)) return [];

  const normalized = value.flatMap((candidate) => {
    if (isNavigationDestinationId(candidate)) return [candidate];
    if (typeof candidate !== "string") return [];
    const migrated = legacyDestinationIds[candidate];
    return migrated ? [migrated] : [];
  });

  return [...new Set(normalized)].slice(0, MAX_FAVORITE_DESTINATIONS);
}

export function toggleFavoriteDestination(
  favorites: NavigationDestinationId[],
  destinationId: NavigationDestinationId,
) {
  const current = parseFavoriteDestinationIds(favorites);
  if (current.includes(destinationId)) {
    return current.filter((id) => id !== destinationId);
  }
  return [destinationId, ...current].slice(0, MAX_FAVORITE_DESTINATIONS);
}

export function buildNavigationDestinations(
  catalog: OpenStackCatalogService[] | null,
  regionId?: string | null,
  policy: ServicePolicy = defaultServicePolicy,
): NavigationDestination[] {
  const selectedObjectStorageBackend =
    catalog && regionId
      ? (resolveObjectStorageBackend(catalog, regionId, policy)?.backend ??
        null)
      : (enabledObjectStorageBackends(policy, regionId)[0] ?? null);

  return definitions
    .filter(
      (definition) =>
        isServiceEnabled(policy, definition.policyService, regionId) &&
        (!definition.objectStorageBackend ||
          definition.objectStorageBackend === selectedObjectStorageBackend),
    )
    .map((definition) => {
      let status: NavigationDestinationStatus;
      let message: string;

      if (!regionId) {
        status = "unknown";
        message = "Select a region to verify availability";
      } else if (!catalog) {
        status = "unknown";
        message = "Catalog availability could not be verified";
      } else {
        const available = definition.catalogIdentities.some(
          ({ serviceType, serviceName }) =>
            resolveServiceEndpoint(
              catalog,
              regionId,
              serviceType,
              serviceName,
            ) !== null,
        );
        status = available ? "available" : "unavailable";
        message = available
          ? `Available in ${regionId}`
          : `Unavailable in ${regionId}`;
      }

      const {
        catalogIdentities: _,
        objectStorageBackend: __,
        policyService: ___,
        ...destination
      } = definition;
      return { ...destination, status, message };
    });
}
