import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import {
  getProjectVisibleAddressGroup,
  listProjectOwnedAddressGroups,
  listProjectVisibleAddressGroups,
} from "@/lib/openstack/neutron-address-group-actions";

function group(id: string, projectId: string) {
  return {
    addresses: [],
    description: "",
    id,
    name: id,
    project_id: projectId,
  };
}

describe("project-visible Neutron address groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectRoles: [{ id: "member-id", name: "member" }],
      projectId: "project-a",
      regionId: "RegionOne",
    });
  });

  it("preserves Neutron's policy-scoped collection for ordinary users", async () => {
    const owned = group("owned", "project-a");
    const shared = group("shared", "project-b");
    mocks.openstackRequest.mockResolvedValue({
      address_groups: [owned, shared],
    });

    await expect(
      listProjectVisibleAddressGroups("RegionOne", "project-a", true),
    ).resolves.toEqual([owned, shared]);
    expect(mocks.openstackRequest).toHaveBeenCalledOnce();
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v2.0/address-groups" }),
    );
  });

  it("loads the active project's owned collection through the scoped action", async () => {
    const owned = group("owned", "project-a");
    mocks.openstackRequest.mockResolvedValue({ address_groups: [owned] });

    await expect(
      listProjectOwnedAddressGroups("RegionOne", "project-a"),
    ).resolves.toEqual([owned]);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/address-groups?project_id=project-a",
      }),
    );
  });

  it("filters administrator visibility to owned and RBAC-shared groups", async () => {
    mocks.getSession.mockResolvedValue({
      keystoneProjectRoles: [{ id: "admin-id", name: "Admin" }],
      projectId: "project-a",
      regionId: "RegionOne",
    });
    const owned = group("owned", "project-a");
    const directShare = group("direct-share", "project-b");
    const globalShare = group("global-share", "project-c");
    const privateGroup = group("private", "project-d");
    mocks.openstackRequest
      .mockResolvedValueOnce({ address_groups: [owned] })
      .mockResolvedValueOnce({
        address_groups: [owned, directShare, globalShare, privateGroup],
      })
      .mockResolvedValueOnce({
        rbac_policies: [
          {
            action: "access_as_shared",
            object_id: directShare.id,
            object_type: "address_group",
            target_project: "project-a",
          },
          {
            action: "access_as_shared",
            object_id: privateGroup.id,
            object_type: "network",
            target_project: "project-a",
          },
        ],
      })
      .mockResolvedValueOnce({
        rbac_policies: [
          {
            action: "access_as_shared",
            object_id: globalShare.id,
            object_type: "address_group",
            target_tenant: "*",
          },
        ],
      });

    await expect(
      listProjectVisibleAddressGroups("RegionOne", "project-a", true),
    ).resolves.toEqual([owned, directShare, globalShare]);
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/v2.0/address-groups?project_id=project-a",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        path: "/v2.0/rbac-policies?object_type=address_group&action=access_as_shared&target_project=project-a",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        path: "/v2.0/rbac-policies?object_type=address_group&action=access_as_shared&target_project=*",
      }),
    );
  });

  it("fails closed to owned groups when address-group RBAC is unavailable", async () => {
    mocks.getSession.mockResolvedValue({
      keystoneProjectRoles: [{ id: "admin-id", name: "admin" }],
      projectId: "project-a",
      regionId: "RegionOne",
    });
    const owned = group("owned", "project-a");
    mocks.openstackRequest.mockResolvedValue({ address_groups: [owned] });

    await expect(
      listProjectVisibleAddressGroups("RegionOne", "project-a", false),
    ).resolves.toEqual([owned]);
    expect(mocks.openstackRequest).toHaveBeenCalledOnce();
  });

  it("does not resolve a private foreign group by direct URL", async () => {
    mocks.getSession.mockResolvedValue({
      keystoneProjectRoles: [{ id: "admin-id", name: "admin" }],
      projectId: "project-a",
      regionId: "RegionOne",
    });
    const owned = group("owned", "project-a");
    const privateGroup = group("private", "project-b");
    mocks.openstackRequest
      .mockResolvedValueOnce({ address_groups: [owned] })
      .mockResolvedValueOnce({ address_groups: [owned, privateGroup] })
      .mockResolvedValueOnce({ rbac_policies: [] })
      .mockResolvedValueOnce({ rbac_policies: [] });

    await expect(
      getProjectVisibleAddressGroup(
        "RegionOne",
        "project-a",
        privateGroup.id,
        true,
      ),
    ).resolves.toBeNull();
  });

  it("rejects a scope that differs from the active session", async () => {
    await expect(
      listProjectVisibleAddressGroups("RegionTwo", "project-a", true),
    ).rejects.toThrow("region does not match");
    await expect(
      listProjectVisibleAddressGroups("RegionOne", "project-b", true),
    ).rejects.toThrow("project does not match");
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });
});
