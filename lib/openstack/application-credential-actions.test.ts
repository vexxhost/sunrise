import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
  getApplicationCredentialAction: vi.fn(),
  getUserInfo: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/keystone-actions", () => ({
  getUserInfo: mocks.getUserInfo,
}));
vi.mock("@/lib/openstack/application-credentials", () => ({
  getApplicationCredentialAction: mocks.getApplicationCredentialAction,
}));
vi.mock("@/lib/openstack/identity-api", () => ({
  identityApiUrl: () => "https://identity.example.test/v3",
}));

import {
  createApplicationCredentialAction,
  deleteApplicationCredentialAction,
} from "@/lib/openstack/application-credential-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("application credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserInfo.mockResolvedValue({
      id: "user-a",
      project: { id: "project-a", name: "Project A" },
      roles: [
        { id: "reader-id", name: "reader" },
        { id: "member-id", name: "member" },
      ],
    });
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: { id: "credential-a", secret: "secret" },
      message: "Created",
      scope,
    });
    mocks.getApplicationCredentialAction.mockResolvedValue({
      id: "credential-a",
      name: "credential-a",
      project_id: "project-a",
    });
  });

  it("creates a project-scoped credential with selected roles and access rules", async () => {
    await createApplicationCredentialAction(scope, {
      name: "ci-deployer",
      roleIds: ["reader-id"],
      accessRules: [
        { service: "compute", method: "GET", path: "/v2.1/servers" },
      ],
      unrestricted: false,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOverride: "https://identity.example.test/v3",
        requireRegion: false,
        path: "/users/user-a/application_credentials",
        body: {
          application_credential: expect.objectContaining({
            name: "ci-deployer",
            roles: [{ id: "reader-id" }],
            access_rules: [
              {
                service: "compute",
                method: "GET",
                path: "/v2.1/servers",
              },
            ],
            unrestricted: false,
          }),
        },
      }),
    );
  });

  it("omits roles to inherit every role in the current token", async () => {
    await createApplicationCredentialAction(scope, {
      name: "all-roles",
      accessRules: [],
      unrestricted: false,
    });

    expect(
      mocks.executeOpenStackMutation.mock.calls[0][0].body
        .application_credential.roles,
    ).toBeUndefined();
  });

  it("rejects roles that are not present in the current scoped token", async () => {
    const result = await createApplicationCredentialAction(scope, {
      name: "privilege-escalation",
      roleIds: ["admin-id"],
      accessRules: [],
      unrestricted: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("deletes only beneath the current server-derived user", async () => {
    await deleteApplicationCredentialAction(scope, "credential-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/users/user-a/application_credentials/credential-a",
        requireRegion: false,
      }),
    );
  });

  it("rejects deletion when the credential is not in the active project", async () => {
    mocks.getApplicationCredentialAction.mockResolvedValueOnce(null);

    const result = await deleteApplicationCredentialAction(
      scope,
      "other-project-credential",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
