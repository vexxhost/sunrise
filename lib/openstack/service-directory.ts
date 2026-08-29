import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";

export type ServiceDirectoryId =
  | "compute"
  | "kubernetes"
  | "object-storage"
  | "orchestration"
  | "dns"
  | "file-system";

export type ServiceDirectoryStatus =
  | "available"
  | "unavailable"
  | "unknown";

export type ServiceDirectoryItem = {
  id: ServiceDirectoryId;
  label: string;
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
    href: "/compute/instances",
    catalogIdentities: [{ serviceType: "compute", serviceName: "nova" }],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
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
    href: "/object-storage",
    catalogIdentities: [
      { serviceType: "object-storage-s3", serviceName: "s3" },
    ],
  },
  {
    id: "orchestration",
    label: "Orchestration",
    href: "/orchestration",
    catalogIdentities: [
      { serviceType: "orchestration", serviceName: "heat" },
    ],
  },
  {
    id: "dns",
    label: "DNS",
    href: "/dns",
    catalogIdentities: [{ serviceType: "dns", serviceName: "designate" }],
  },
  {
    id: "file-system",
    label: "File System",
    href: "/file-system",
    catalogIdentities: [
      { serviceType: "sharev2", serviceName: "manilav2" },
      { serviceType: "shared-file-system", serviceName: "manila" },
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
      href: definition.href,
      status: "unknown",
      message,
    }));
  }

  return serviceDirectoryDefinitions.map((definition) => {
    const available = definition.catalogIdentities.some(
      ({ serviceType, serviceName }) =>
        resolveServiceEndpoint(
          catalog,
          regionId,
          serviceType,
          serviceName,
        ) !== null,
    );

    return {
      id: definition.id,
      label: definition.label,
      href: definition.href,
      status: available ? "available" : "unavailable",
      message: available
        ? `Available in ${regionId}`
        : `Unavailable in ${regionId}`,
    };
  });
}
