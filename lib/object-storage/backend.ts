import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import {
  enabledObjectStorageBackends,
  type ObjectStorageBackend,
  type ServicePolicy,
} from "@/lib/service-policy";

export const objectStorageCatalogIdentities: Record<
  ObjectStorageBackend,
  Array<{ serviceType: string; serviceName: string }>
> = {
  s3: [{ serviceType: "object-storage-s3", serviceName: "s3" }],
  swift: [
    { serviceType: "object-storage", serviceName: "object-storage" },
    { serviceType: "object-store", serviceName: "swift" },
  ],
};

export type ObjectStorageBackendResolution = {
  backend: ObjectStorageBackend;
  endpoint: string;
};

export function resolveObjectStorageBackend(
  catalog: OpenStackCatalogService[],
  regionId: string,
  policy: ServicePolicy,
): ObjectStorageBackendResolution | null {
  for (const backend of enabledObjectStorageBackends(policy, regionId)) {
    for (const { serviceType, serviceName } of objectStorageCatalogIdentities[
      backend
    ]) {
      const endpoint = resolveServiceEndpoint(
        catalog,
        regionId,
        serviceType,
        serviceName,
      );
      if (endpoint) return { backend, endpoint };
    }
  }
  return null;
}
