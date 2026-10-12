import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectScopedTokenContext: vi.fn(),
  getServicePolicy: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  refreshActiveProjectS3Credentials: vi.fn(),
  saveRedisSession: vi.fn(),
  writePrefs: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({
  clearS3Credentials: vi.fn((session) => {
    session.s3Credentials = undefined;
  }),
  getS3CredentialsForProject: vi.fn(),
  getSession: mocks.getSession,
}));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));
vi.mock("@/lib/keystone/login", () => ({
  getProjectScopedTokenContext: mocks.getProjectScopedTokenContext,
}));
vi.mock("@/lib/s3/session", () => ({
  refreshActiveProjectS3Credentials: mocks.refreshActiveProjectS3Credentials,
}));
vi.mock("@/lib/deployment-config", () => ({
  getServicePolicy: mocks.getServicePolicy,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: vi.fn(),
}));
vi.mock("@/lib/object-storage/backend", () => ({
  resolveObjectStorageBackend: vi.fn(),
}));
vi.mock("@/lib/service-policy", () => ({
  isObjectStorageBackendEnabled: vi.fn(() => false),
  isSunriseServiceEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/prefs", () => ({ writePrefs: mocks.writePrefs }));
vi.mock("@/lib/preference-identity", () => ({
  preferenceIdentityFromSession: vi.fn(() => "identity-1"),
}));

import { setProject } from "@/lib/keystone/actions";

const project = {
  id: "project-2",
  name: "Project Two",
};

function session() {
  return {
    keystone_unscoped_token: "unscoped-token",
    keycloakRefreshToken: "refresh-token-1",
    oidcSessionGeneration: "generation-1",
    federationIdentityProvider: "demo",
    projectId: "project-1",
    regionId: "RegionOne",
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Keystone context actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServicePolicy.mockReturnValue({ objectStorageBackends: [] });
    mocks.getProjectScopedTokenContext.mockResolvedValue({
      value: "project-2-token",
      roles: [{ id: "member-id", name: "member" }],
    });
    mocks.saveRedisSession.mockImplementation(async (current) =>
      current.save(),
    );
  });

  it("persists project credentials before optional Object Storage work", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);

    await setProject(project as never);

    expect(current).toMatchObject({
      projectId: "project-2",
      keystoneProjectToken: "project-2-token",
      keystoneProjectRoles: [{ id: "member-id", name: "member" }],
    });
    expect(current.save).toHaveBeenCalledOnce();
    expect(mocks.writePrefs).toHaveBeenCalledOnce();
  });

  it("does not merge project credentials over a completed continuation", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.saveRedisSession.mockImplementation(async (_active, options) => {
      options.validateConflictRetry({
        ...current,
        keycloakRefreshToken: "refresh-token-2",
        oidcSessionGeneration: "generation-2",
      });
    });

    await expect(setProject(project as never)).rejects.toThrow(
      "superseded by a newer OIDC session",
    );

    expect(mocks.refreshActiveProjectS3Credentials).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
    expect(current.save).not.toHaveBeenCalled();
  });

  it("does not let a delayed project switch replace a newer selection", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.saveRedisSession.mockImplementation(async (_active, options) => {
      options.validateConflictRetry({
        ...current,
        projectId: "project-3",
      });
    });

    await expect(setProject(project as never)).rejects.toThrow(
      "superseded by a newer OIDC session",
    );

    expect(mocks.refreshActiveProjectS3Credentials).not.toHaveBeenCalled();
    expect(mocks.writePrefs).not.toHaveBeenCalled();
  });
});
