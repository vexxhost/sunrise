import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import { buildCreateActions, type CreateAction } from "@/lib/create-actions";
import {
  buildServiceDirectory,
  type ServiceDirectoryItem,
} from "@/lib/openstack/service-directory";
import {
  buildNavigationDestinations,
  parseFavoriteDestinationIds,
  type NavigationDestination,
  type NavigationDestinationId,
} from "@/lib/navigation-destinations";
import type { SunrisePrefs } from "@/lib/prefs";
import {
  visibleResourcePreferences,
  type ResourcePreference,
} from "@/lib/resource-preferences";
import { roleNameFromArn } from "@/lib/s3/arn";
import {
  getS3CredentialsForProject,
  normalizeProjectId,
  type SunriseSession,
} from "@/lib/session";
import type { Project, Region } from "@/types/openstack";
import {
  defaultServicePolicy,
  isServiceEnabled,
  isSunriseServiceEnabled,
  type OpenStackServiceId,
  type ObjectStorageBackend,
  type ServicePolicy,
} from "@/lib/service-policy";

export type CloudSelection = {
  id: string | null;
  name: string;
  status: "selected" | "missing";
};

export type CloudRole = {
  arn: string | null;
  name: string | null;
  status: "active" | "authentication-required" | "unavailable";
  credentialExpiration: number | null;
  message: string;
};

export type CloudCatalog = {
  status: "available" | "authentication-required" | "unavailable";
  message: string;
};

export type CloudObjectStorage = {
  backend: ObjectStorageBackend | null;
  status: "available" | "unavailable" | "unknown" | "disabled";
  message: string;
};

export type CloudContextSnapshot = {
  user: { name: string | null };
  project: CloudSelection;
  region: CloudSelection;
  role: CloudRole;
  objectStorage: CloudObjectStorage;
  catalog: CloudCatalog;
  projects: Project[];
  regions: Region[];
  services: ServiceDirectoryItem[];
  destinations: NavigationDestination[];
  favoriteDestinations: NavigationDestinationId[];
  createActions: CreateAction[];
  personalResources: {
    pinned: ResourcePreference[];
    recent: ResourcePreference[];
  };
};

type BuildCloudContextInput = {
  session: SunriseSession;
  prefs: SunrisePrefs;
  projects: Project[];
  regions: Region[];
  userName?: string | null;
  catalog: OpenStackCatalogService[] | null;
  servicePolicy?: ServicePolicy;
};

function activeRole(
  session: SunriseSession,
  objectStorage: CloudObjectStorage,
): CloudRole {
  if (objectStorage.backend !== "s3") {
    return {
      arn: null,
      name: null,
      status: "unavailable",
      credentialExpiration: null,
      message:
        objectStorage.status === "disabled"
          ? "Object Storage is disabled by the deployment"
          : objectStorage.backend === "swift"
            ? "S3 access roles are not used by Swift"
            : objectStorage.message,
    };
  }

  const projectId = normalizeProjectId(session.projectId);
  if (!projectId) {
    return {
      arn: null,
      name: null,
      status: "unavailable",
      credentialExpiration: null,
      message: "Select a project to resolve its Object Storage role",
    };
  }

  const roleArn = session.s3ProjectRoles?.[projectId] ?? null;
  const credentials = getS3CredentialsForProject(session, projectId);
  const credentialExpiration =
    normalizeProjectId(session.s3Credentials?.projectId) === projectId
      ? (session.s3Credentials?.expiration ?? null)
      : null;

  if (!roleArn) {
    return {
      arn: null,
      name: null,
      status: "unavailable",
      credentialExpiration,
      message: "No Object Storage role is mapped to this project",
    };
  }

  let roleName: string;
  try {
    roleName = roleNameFromArn(roleArn);
  } catch {
    return {
      arn: roleArn,
      name: null,
      status: "unavailable",
      credentialExpiration,
      message: "The Object Storage role mapping is invalid",
    };
  }

  return {
    arn: roleArn,
    name: roleName,
    status: credentials ? "active" : "authentication-required",
    credentialExpiration,
    message: credentials
      ? `Using ${roleName}`
      : `Sign in to Object Storage to use ${roleName}`,
  };
}

function objectStorageContext(
  catalog: OpenStackCatalogService[] | null,
  regionId: string | undefined,
  policy: ServicePolicy,
): CloudObjectStorage {
  if (!isSunriseServiceEnabled(policy, "object-storage", regionId)) {
    return {
      backend: null,
      status: "disabled",
      message: "Disabled by the Sunrise deployment configuration",
    };
  }
  if (!regionId) {
    return {
      backend: null,
      status: "unknown",
      message: "Select a region to resolve an Object Storage backend",
    };
  }
  if (!catalog) {
    return {
      backend: null,
      status: "unknown",
      message: "Object Storage catalog availability could not be verified",
    };
  }

  const resolution = resolveObjectStorageBackend(catalog, regionId, policy);
  if (!resolution) {
    return {
      backend: null,
      status: "unavailable",
      message: `No configured Object Storage backend is available in ${regionId}`,
    };
  }
  return {
    backend: resolution.backend,
    status: "available",
    message: `${resolution.backend === "s3" ? "S3" : "Swift"} selected in ${regionId}`,
  };
}

const resourceServices: Partial<
  Record<ResourcePreference["kind"], OpenStackServiceId>
> = {
  instance: "compute",
  volume: "volume",
  image: "image",
  cluster: "container-infra",
  share: "share",
  "share-snapshot": "share",
  secret: "key-manager",
  "secret-container": "key-manager",
  "secret-order": "key-manager",
};

export function buildCloudContextSnapshot({
  session,
  prefs,
  projects,
  regions,
  userName,
  catalog,
  servicePolicy = defaultServicePolicy,
}: BuildCloudContextInput): CloudContextSnapshot {
  const selectedProject = projects.find(
    (project) => project.id === session.projectId,
  );
  const selectedRegion = regions.find(
    (region) => region.id === session.regionId,
  );
  const projectName =
    selectedProject?.name ??
    (prefs.projectId === session.projectId ? prefs.projectName : undefined) ??
    session.projectId ??
    "No project selected";
  const regionName =
    selectedRegion?.id ?? session.regionId ?? "No region selected";
  const objectStorage = objectStorageContext(
    catalog,
    session.regionId,
    servicePolicy,
  );
  const visiblePersonalResources = visibleResourcePreferences({
    recent: prefs.recentResources ?? [],
    pinned: prefs.pinnedResources ?? [],
    context: {
      projectId: session.projectId ?? "",
      regionId: session.regionId ?? "",
    },
  });
  const personalResources = {
    pinned: visiblePersonalResources.pinned.filter((resource) => {
      if (resource.kind === "bucket" && objectStorage.backend !== "s3") {
        return false;
      }
      const serviceId = resourceServices[resource.kind];
      return (
        !serviceId ||
        isServiceEnabled(servicePolicy, serviceId, session.regionId)
      );
    }),
    recent: visiblePersonalResources.recent.filter((resource) => {
      if (resource.kind === "bucket" && objectStorage.backend !== "s3") {
        return false;
      }
      const serviceId = resourceServices[resource.kind];
      return (
        !serviceId ||
        isServiceEnabled(servicePolicy, serviceId, session.regionId)
      );
    }),
  };
  const catalogStatus: CloudCatalog = session.keystoneProjectToken
    ? catalog
      ? {
          status: "available",
          message: `Service availability verified in ${regionName}`,
        }
      : {
          status: "unavailable",
          message: "Service catalog availability could not be verified",
        }
    : {
        status: "authentication-required",
        message: "Sign in to verify service availability",
      };
  const role = activeRole(session, objectStorage);

  return {
    user: {
      name:
        userName ??
        session.oidcIdentity?.preferredUsername ??
        session.oidcIdentity?.displayName ??
        null,
    },
    project: {
      id: session.projectId ?? null,
      name: projectName,
      status: session.projectId ? "selected" : "missing",
    },
    region: {
      id: session.regionId ?? null,
      name: regionName,
      status: session.regionId ? "selected" : "missing",
    },
    role,
    objectStorage,
    catalog: catalogStatus,
    projects,
    regions,
    services: buildServiceDirectory(catalog, session.regionId, servicePolicy),
    destinations: buildNavigationDestinations(
      catalog,
      session.regionId,
      servicePolicy,
    ),
    favoriteDestinations: parseFavoriteDestinationIds(
      prefs.favoriteDestinations,
    ),
    createActions: buildCreateActions({
      catalog,
      catalogStatus: catalogStatus.status,
      objectStorageRole: role,
      projectId: session.projectId,
      regionId: session.regionId,
      policy: servicePolicy,
    }),
    personalResources,
  };
}
