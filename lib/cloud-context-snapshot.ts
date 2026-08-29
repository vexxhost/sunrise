import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import {
  buildServiceDirectory,
  type ServiceDirectoryItem,
} from "@/lib/openstack/service-directory";
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

export type CloudContextSnapshot = {
  user: { name: string | null };
  project: CloudSelection;
  region: CloudSelection;
  role: CloudRole;
  catalog: CloudCatalog;
  projects: Project[];
  regions: Region[];
  services: ServiceDirectoryItem[];
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
};

function activeRole(session: SunriseSession): CloudRole {
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

export function buildCloudContextSnapshot({
  session,
  prefs,
  projects,
  regions,
  userName,
  catalog,
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
  const personalResources = visibleResourcePreferences({
    recent: prefs.recentResources ?? [],
    pinned: prefs.pinnedResources ?? [],
    context: {
      projectId: session.projectId ?? "",
      regionId: session.regionId ?? "",
    },
  });
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

  return {
    user: { name: userName ?? null },
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
    role: activeRole(session),
    catalog: catalogStatus,
    projects,
    regions,
    services: buildServiceDirectory(catalog, session.regionId),
    personalResources,
  };
}
