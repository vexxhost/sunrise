import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstack: vi.fn(),
}));

vi.mock("@/lib/openstack/actions", () => ({ openstack: mocks.openstack }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { listClustersAction } from "@/lib/openstack/magnum";

describe("Magnum cluster queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ regionId: "RegionOne" });
    mocks.openstack.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "/clusters/detail?limit=20") {
        return {
          clusters: [
            {
              uuid: "cluster-a",
              name: "ours",
              project_id: "project-a",
              status: "CREATE_COMPLETE",
            },
            {
              uuid: "cluster-b",
              name: "foreign",
              project_id: "project-b",
              status: "CREATE_COMPLETE",
            },
          ],
        };
      }
      if (path.endsWith("/nodegroups")) return { nodegroups: [] };
      throw new Error(`Unexpected Magnum path: ${path}`);
    });
  });

  it("uses the detailed collection and filters to the active project", async () => {
    const result = await listClustersAction(
      { limit: 20 },
      "RegionOne",
      "project-a",
    );

    expect(result.map(({ uuid }) => uuid)).toEqual(["cluster-a"]);
    expect(mocks.openstack).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/detail?limit=20",
        apiVersion: "container-infra latest",
      }),
    );
  });
});
