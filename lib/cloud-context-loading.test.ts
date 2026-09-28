import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildCloudContextSnapshot: vi.fn(),
  getProjects: vi.fn(),
  getRegions: vi.fn(),
  getServiceCatalog: vi.fn(),
  getUserInfo: vi.fn(),
  readPrefs: vi.fn(),
  getSession: vi.fn(),
  takeCloudContextBootstrap: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloud-context-bootstrap", () => ({
  takeCloudContextBootstrap: mocks.takeCloudContextBootstrap,
}));
vi.mock("@/lib/cloud-context-snapshot", () => ({
  buildCloudContextSnapshot: mocks.buildCloudContextSnapshot,
}));
vi.mock("@/lib/keystone/queries", () => ({
  getProjects: mocks.getProjects,
  getRegions: mocks.getRegions,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
}));
vi.mock("@/lib/openstack/keystone-actions", () => ({
  getUserInfo: mocks.getUserInfo,
}));
vi.mock("@/lib/prefs", () => ({ readPrefs: mocks.readPrefs }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { loadCloudContextUncached } from "@/lib/cloud-context";

const session = {
  projectId: "project-1",
  regionId: "RegionOne",
  keystoneProjectToken: "project-token",
  cloudContextBootstrapId: "bootstrap-id",
  oidcIdentity: {
    displayName: "OIDC Operator",
    preferredUsername: "operator@example.test",
  },
};
const projects = [{ id: "project-1", name: "Project One" }];
const regions = [{ id: "RegionOne" }];
const catalog = [{ name: "nova", type: "compute", endpoints: [] }];

describe("cloud context loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session);
    mocks.readPrefs.mockResolvedValue({ appearance: "dark" });
    mocks.buildCloudContextSnapshot.mockReturnValue({ snapshot: true });
  });

  it("reuses cold-login discovery without repeating Keystone requests", async () => {
    mocks.takeCloudContextBootstrap.mockReturnValue({
      projects,
      regions,
      catalog,
      userName: "Keystone Operator",
    });

    await expect(loadCloudContextUncached()).resolves.toMatchObject({
      keystoneToken: "project-token",
      catalog,
      appearance: "dark",
    });

    expect(mocks.getProjects).not.toHaveBeenCalled();
    expect(mocks.getRegions).not.toHaveBeenCalled();
    expect(mocks.getUserInfo).not.toHaveBeenCalled();
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
    expect(mocks.buildCloudContextSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        projects,
        regions,
        userName: "Keystone Operator",
        catalog,
      }),
    );
  });

  it("uses live discovery on warm navigation after the handoff is gone", async () => {
    mocks.takeCloudContextBootstrap.mockReturnValue(undefined);
    mocks.getProjects.mockResolvedValue(projects);
    mocks.getRegions.mockResolvedValue(regions);
    mocks.getServiceCatalog.mockResolvedValue(catalog);

    await loadCloudContextUncached();

    expect(mocks.getProjects).toHaveBeenCalledOnce();
    expect(mocks.getRegions).toHaveBeenCalledOnce();
    expect(mocks.getServiceCatalog).toHaveBeenCalledWith("project-token");
    expect(mocks.getUserInfo).not.toHaveBeenCalled();
    expect(mocks.buildCloudContextSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "operator@example.test" }),
    );
  });
});
