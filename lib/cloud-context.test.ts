import { describe, expect, it } from "vitest";
import { buildCloudContextSnapshot } from "@/lib/cloud-context-snapshot";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import type { SunrisePrefs } from "@/lib/prefs";
import type { ResourcePreference } from "@/lib/resource-preferences";
import type { SunriseSession } from "@/lib/session";
import type { Project, Region } from "@/types/openstack";

const projectOneId = "7a96a68d-c826-4f3d-84fa-fd95a72265c5";
const projectTwoId = "37c05c43-a57d-4190-97dc-e9eee2769027";
const normalizedProjectOne = projectOneId.replaceAll("-", "");
const normalizedProjectTwo = projectTwoId.replaceAll("-", "");

function project(id: string, name: string): Project {
  return {
    id,
    name,
    domain_id: "default",
    description: "",
    enabled: true,
    parent_id: "",
    is_domain: false,
    tags: [],
    options: {},
    links: { self: `https://keystone.example.test/v3/projects/${id}` },
  };
}

const regions: Region[] = [
  {
    id: "RegionOne",
    links: { self: "https://keystone.example.test/v3/regions/RegionOne" },
  },
];

const projects = [
  project(projectOneId, "demo-project1"),
  project(projectTwoId, "service"),
];

const catalog: OpenStackCatalogService[] = [
  {
    name: "nova",
    type: "compute",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://nova.example.test",
      },
    ],
  },
];

function resource(
  id: string,
  projectId = normalizedProjectOne,
): ResourcePreference {
  return {
    kind: "instance",
    id,
    name: `Instance ${id}`,
    projectId,
    regionId: "RegionOne",
    updatedAt: 1,
  };
}

function build(
  session: SunriseSession,
  prefs: SunrisePrefs = {},
  serviceCatalog: OpenStackCatalogService[] | null = catalog,
) {
  return buildCloudContextSnapshot({
    session,
    prefs,
    projects,
    regions,
    userName: "Sunrise Operator",
    catalog: serviceCatalog,
  });
}

describe("cloud context snapshot", () => {
  it("binds the active project to its own role and resources", () => {
    const snapshot = build(
      {
        projectId: projectTwoId,
        regionId: "RegionOne",
        keystoneProjectToken: "keystone-token",
        s3ProjectRoles: {
          [normalizedProjectOne]:
            "arn:aws:iam::RGW11111111111111111:role/service-roles/ProjectOneReadWrite",
          [normalizedProjectTwo]:
            "arn:aws:iam::RGW22222222222222222:role/service-roles/ServiceReadOnly",
        },
        s3Credentials: {
          projectId: normalizedProjectTwo,
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
          sessionToken: "session-token",
          expiration: Date.now() + 3_600_000,
        },
      },
      {
        pinnedResources: [
          resource("other"),
          resource("current", normalizedProjectTwo),
        ],
      },
    );

    expect(snapshot.project).toMatchObject({
      id: projectTwoId,
      name: "service",
      status: "selected",
    });
    expect(snapshot.role).toMatchObject({
      name: "ServiceReadOnly",
      status: "active",
    });
    expect(snapshot.role.arn).toContain("RGW22222222222222222");
    expect(snapshot.personalResources.pinned.map(({ id }) => id)).toEqual([
      "current",
    ]);
  });

  it("requires Object Storage authentication when credentials are expired", () => {
    const snapshot = build({
      projectId: projectOneId,
      regionId: "RegionOne",
      keystoneProjectToken: "keystone-token",
      s3ProjectRoles: {
        [normalizedProjectOne]:
          "arn:aws:iam::RGW11111111111111111:role/ProjectOneReadWrite",
      },
      s3Credentials: {
        projectId: normalizedProjectOne,
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        sessionToken: "session-token",
        expiration: Date.now() - 1,
      },
    });

    expect(snapshot.role).toMatchObject({
      name: "ProjectOneReadWrite",
      status: "authentication-required",
    });
  });

  it("reports invalid role mappings without exposing credentials", () => {
    const snapshot = build({
      projectId: projectOneId,
      regionId: "RegionOne",
      keystoneProjectToken: "keystone-token",
      s3ProjectRoles: { [normalizedProjectOne]: "not-an-arn" },
    });

    expect(snapshot.role).toEqual(
      expect.objectContaining({
        arn: "not-an-arn",
        name: null,
        status: "unavailable",
        message: "The Object Storage role mapping is invalid",
      }),
    );
    expect(JSON.stringify(snapshot)).not.toContain("secretAccessKey");
  });

  it("distinguishes missing authentication from an unavailable catalog", () => {
    const signedOut = build(
      { projectId: projectOneId, regionId: "RegionOne" },
      {},
      null,
    );
    const unavailable = build(
      {
        projectId: projectOneId,
        regionId: "RegionOne",
        keystoneProjectToken: "keystone-token",
      },
      {},
      null,
    );

    expect(signedOut.catalog.status).toBe("authentication-required");
    expect(unavailable.catalog.status).toBe("unavailable");
    expect(
      unavailable.services.every(({ status }) => status === "unknown"),
    ).toBe(true);
  });

  it("derives selected names and region-specific service availability", () => {
    const snapshot = build({
      projectId: projectOneId,
      regionId: "RegionOne",
      keystoneProjectToken: "keystone-token",
    });

    expect(snapshot.user.name).toBe("Sunrise Operator");
    expect(snapshot.project.name).toBe("demo-project1");
    expect(snapshot.region.name).toBe("RegionOne");
    expect(snapshot.catalog.status).toBe("available");
    expect(snapshot.services.find(({ id }) => id === "compute")?.status).toBe(
      "available",
    );
    expect(
      snapshot.services.find(({ id }) => id === "kubernetes")?.status,
    ).toBe("unavailable");
  });
});
