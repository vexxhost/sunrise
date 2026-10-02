import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";

export type ServiceDirectoryId =
  | "compute"
  | "networking"
  | "kubernetes"
  | "object-storage"
  | "identity"
  | "orchestration"
  | "dns"
  | "shared-file-system"
  | "key-manager";

export type ServiceDirectoryStatus = "available" | "unavailable" | "unknown";

export type ServiceDirectoryItem = {
  id: ServiceDirectoryId;
  label: string;
  description: string;
  href: string;
  status: ServiceDirectoryStatus;
  message: string;
};

type CatalogIdentity = {
  serviceType: string;
  serviceName: string;
};

type ServiceDirectoryDefinition = Omit<
  ServiceDirectoryItem,
  "status" | "message"
> & {
  catalogIdentities: CatalogIdentity[];
};

const serviceDirectoryDefinitions: ServiceDirectoryDefinition[] = [
  {
    id: "compute",
    label: "Compute",
    description: "Virtual machines, images, block storage, and SSH keys.",
    href: "/compute",
    catalogIdentities: [{ serviceType: "compute", serviceName: "nova" }],
  },
  {
    id: "networking",
    label: "Networking",
    description: "Networks, routing, public addresses, and traffic security.",
    href: "/networking",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    description: "Deploy and operate Magnum-backed Kubernetes clusters.",
    href: "/kubernetes",
    catalogIdentities: [
      { serviceType: "container-infra", serviceName: "magnum" },
      { serviceType: "container-infrastructure", serviceName: "magnum" },
      {
        serviceType: "container-infrastructure-management",
        serviceName: "magnum",
      },
    ],
  },
  {
    id: "object-storage",
    label: "Object Storage",
    description: "Browse buckets, objects, and S3 access roles.",
    href: "/object-storage",
    catalogIdentities: [
      { serviceType: "object-storage-s3", serviceName: "s3" },
    ],
  },
  {
    id: "identity",
    label: "Identity",
    description: "Manage project-scoped application credentials and access.",
    href: "/identity",
    catalogIdentities: [{ serviceType: "identity", serviceName: "keystone" }],
  },
  {
    id: "orchestration",
    label: "Orchestration",
    description: "Deploy infrastructure from reusable Heat templates.",
    href: "/orchestration",
    catalogIdentities: [{ serviceType: "orchestration", serviceName: "heat" }],
  },
  {
    id: "dns",
    label: "DNS",
    description: "Manage DNS zones and records with Designate.",
    href: "/dns",
    catalogIdentities: [{ serviceType: "dns", serviceName: "designate" }],
  },
  {
    id: "shared-file-system",
    label: "Shared File System",
    description: "Create and manage shared file systems with Manila.",
    href: "/shared-file-systems",
    catalogIdentities: [
      { serviceType: "sharev2", serviceName: "manilav2" },
      { serviceType: "shared-file-system", serviceName: "manila" },
    ],
  },
  {
    id: "key-manager",
    label: "Key Manager",
    description: "Secure secrets, keys, certificates, and access policies.",
    href: "/key-manager",
    catalogIdentities: [
      { serviceType: "key-manager", serviceName: "barbican" },
    ],
  },
];

export function buildServiceDirectory(
  catalog: OpenStackCatalogService[] | null,
  regionId?: string,
): ServiceDirectoryItem[] {
  if (!catalog || !regionId) {
    const message = regionId
      ? "Catalog availability could not be verified"
      : "Select a region to verify availability";
    return serviceDirectoryDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      href: definition.href,
      status: "unknown",
      message,
    }));
  }

  return serviceDirectoryDefinitions.map((definition) => {
    const available = definition.catalogIdentities.some(
      ({ serviceType, serviceName }) =>
        resolveServiceEndpoint(catalog, regionId, serviceType, serviceName) !==
        null,
    );

    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      href: definition.href,
      status: available ? "available" : "unavailable",
      message: available
        ? `Available in ${regionId}`
        : `Unavailable in ${regionId}`,
    };
  });
}
