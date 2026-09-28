import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { listClustersAction } from "@/lib/openstack/magnum";
import { listClusters } from "@/lib/openstack/magnum-server";

describe("Magnum cluster queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ regionId: "RegionOne" });
    mocks.openstackRequest.mockImplementation(
      async ({ path }: { path: string }) => {
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
      },
    );
  });

  it("uses the detailed collection and filters to the active project", async () => {
    const result = await listClustersAction(
      { limit: 20 },
      "RegionOne",
      "project-a",
    );

    expect(result.map(({ uuid }) => uuid)).toEqual(["cluster-a"]);
    expect(
      mocks.openstackRequest.mock.calls.every(
        ([options]) => options.endpointOverride === undefined,
      ),
    ).toBe(true);
  });

  it("reuses a trusted catalog endpoint from server-only callers", async () => {
    const result = await listClusters(
      { limit: 20 },
      "RegionOne",
      "project-a",
      "https://magnum.example.test/v1",
    );

    expect(result.map(({ uuid }) => uuid)).toEqual(["cluster-a"]);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/detail?limit=20",
        apiVersion: "container-infra latest",
        endpointOverride: "https://magnum.example.test/v1",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/cluster-a/nodegroups",
        endpointOverride: "https://magnum.example.test/v1",
      }),
    );
  });
});
