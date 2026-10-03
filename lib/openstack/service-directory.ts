import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import {
  defaultServicePolicy,
  isServiceEnabled,
  isSunriseServiceEnabled,
  type OpenStackServiceId,
  type ServicePolicy,
  type SunriseServiceId,
} from "@/lib/service-policy";

export type ServiceDirectoryId = SunriseServiceId;

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
  policyService: OpenStackServiceId;
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
    catalogIdentities: [
      {
        policyService: "compute",
        serviceType: "compute",
        serviceName: "nova",
      },
      {
        policyService: "image",
        serviceType: "image",
        serviceName: "glance",
      },
      {
        policyService: "volume",
        serviceType: "volumev3",
        serviceName: "cinderv3",
      },
    ],
  },
  {
    id: "networking",
    label: "Networking",
    description: "Networks, routing, public addresses, and traffic security.",
    href: "/networking",
    catalogIdentities: [
      {
        policyService: "network",
        serviceType: "network",
        serviceName: "neutron",
      },
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    description: "Deploy and operate Magnum-backed Kubernetes clusters.",
    href: "/kubernetes",
    catalogIdentities: [
      {
        policyService: "container-infra",
        serviceType: "container-infra",
        serviceName: "magnum",
      },
      {
        policyService: "container-infra",
        serviceType: "container-infrastructure",
        serviceName: "magnum",
      },
      {
        policyService: "container-infra",
        serviceType: "container-infrastructure-management",
        serviceName: "magnum",
      },
    ],
  },
  {
    id: "object-storage",
    label: "Object Storage",
    description: "Browse object containers, stored objects, and access.",
    href: "/object-storage",
    catalogIdentities: [
      {
        policyService: "object-storage-s3",
        serviceType: "object-storage-s3",
        serviceName: "s3",
      },
    ],
  },
  {
    id: "identity",
    label: "Identity",
    description: "Manage project-scoped application credentials and access.",
    href: "/identity",
    catalogIdentities: [
      {
        policyService: "identity",
        serviceType: "identity",
        serviceName: "keystone",
      },
    ],
  },
  {
    id: "orchestration",
    label: "Orchestration",
    description: "Deploy infrastructure from reusable Heat templates.",
    href: "/orchestration",
    catalogIdentities: [
      {
        policyService: "orchestration",
        serviceType: "orchestration",
        serviceName: "heat",
      },
    ],
  },
  {
    id: "dns",
    label: "DNS",
    description: "Manage DNS zones and records with Designate.",
    href: "/dns",
    catalogIdentities: [
      { policyService: "dns", serviceType: "dns", serviceName: "designate" },
    ],
  },
  {
    id: "shared-file-system",
    label: "Shared File System",
    description: "Create and manage shared file systems with Manila.",
    href: "/shared-file-systems",
    catalogIdentities: [
      {
        policyService: "share",
        serviceType: "sharev2",
        serviceName: "manilav2",
      },
      {
        policyService: "share",
        serviceType: "share",
        serviceName: "manila",
      },
    ],
  },
  {
    id: "key-manager",
    label: "Key Manager",
    description: "Secure secrets, keys, certificates, and access policies.",
    href: "/key-manager",
    catalogIdentities: [
      {
        policyService: "key-manager",
        serviceType: "key-manager",
        serviceName: "barbican",
      },
    ],
  },
];

export function buildServiceDirectory(
  catalog: OpenStackCatalogService[] | null,
  regionId?: string,
  policy: ServicePolicy = defaultServicePolicy,
): ServiceDirectoryItem[] {
  const enabledDefinitions = serviceDirectoryDefinitions.filter(({ id }) =>
    isSunriseServiceEnabled(policy, id, regionId),
  );

  if (!catalog || !regionId) {
    const message = regionId
      ? "Catalog availability could not be verified"
      : "Select a region to verify availability";
    return enabledDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      href: definition.href,
      status: "unknown",
      message,
    }));
  }

  return enabledDefinitions.map((definition) => {
    const objectStorage =
      definition.id === "object-storage"
        ? resolveObjectStorageBackend(catalog, regionId, policy)
        : null;
    const available =
      definition.id === "object-storage"
        ? objectStorage !== null
        : definition.catalogIdentities.some(
            ({ policyService, serviceType, serviceName }) =>
              isServiceEnabled(policy, policyService, regionId) &&
              resolveServiceEndpoint(
                catalog,
                regionId,
                serviceType,
                serviceName,
              ) !== null,
          );
    const backendLabel = objectStorage?.backend === "s3" ? "S3" : "Swift";

    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      href: definition.href,
      status: available ? "available" : "unavailable",
      message: available
        ? definition.id === "object-storage"
          ? `${backendLabel} available in ${regionId}`
          : `Available in ${regionId}`
        : `Unavailable in ${regionId}`,
    };
  });
}
