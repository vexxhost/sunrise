import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  getSession: vi.fn(),
  getUserInfo: vi.fn(),
  openstack: vi.fn(),
}));

vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
}));
vi.mock("@/lib/openstack/actions", () => ({ openstack: mocks.openstack }));
vi.mock("@/lib/openstack/keystone-actions", () => ({
  getUserInfo: mocks.getUserInfo,
}));
vi.mock("@/lib/openstack/identity-api", () => ({
  identityApiUrl: () => "https://identity.example.test/v3",
}));
vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  normalizeProjectId: (value?: string | null) =>
    value?.replaceAll("-", "").toLowerCase() ?? "",
}));

import {
  getApplicationCredentialAction,
  listApplicationCredentialsAction,
} from "@/lib/openstack/application-credentials";
import { OpenStackRequestError } from "@/lib/openstack/request";

describe("application credential queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "token",
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.getUserInfo.mockResolvedValue({
      id: "user-a",
      roles: [{ id: "reader-id", name: "reader" }],
    });
    mocks.getServiceCatalog.mockResolvedValue([
      { type: "compute", name: "nova", endpoints: [] },
      { type: "identity", name: "keystone", endpoints: [] },
    ]);
    mocks.openstack.mockResolvedValue({
      application_credentials: [
        {
          id: "credential-a",
          name: "project-a-credential",
          project_id: "project-a",
          roles: [],
          access_rules: [],
          unrestricted: false,
        },
        {
          id: "credential-b",
          name: "project-b-credential",
          project_id: "project-b",
          roles: [],
          access_rules: [],
          unrestricted: false,
        },
      ],
    });
  });

  it("returns only credentials owned by the active project", async () => {
    const result = await listApplicationCredentialsAction();

    expect(result.credentials.map(({ id }) => id)).toEqual(["credential-a"]);
    expect(result.observedAt).toEqual(expect.any(Number));
    expect(result.roles).toEqual([{ id: "reader-id", name: "reader" }]);
    expect(result.serviceTypes).toEqual(["compute", "identity"]);
    expect(mocks.openstack).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOverride: "https://identity.example.test/v3",
        path: "/users/user-a/application_credentials",
      }),
    );
  });

  it("treats a missing credential as expected stale navigation", async () => {
    mocks.openstack.mockRejectedValueOnce(
      new OpenStackRequestError(404, "Not Found"),
    );

    await expect(getApplicationCredentialAction("missing")).resolves.toBeNull();
    expect(mocks.openstack).toHaveBeenCalledWith(
      expect.objectContaining({ errorMode: "throw" }),
    );
  });

  it("does not hide permission or service failures", async () => {
    const error = new OpenStackRequestError(403, "Forbidden");
    mocks.openstack.mockRejectedValueOnce(error);

    await expect(getApplicationCredentialAction("denied")).rejects.toBe(error);
  });
});
