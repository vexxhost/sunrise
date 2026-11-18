import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  magnumDetailApiVersion: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  magnumDetailApiVersion: mocks.magnumDetailApiVersion,
}));

import { listClustersAction } from "@/lib/openstack/magnum";
import {
  getClusterTemplate,
  listClusterNodeGroups,
  listClusters,
} from "@/lib/openstack/magnum-server";

describe("Magnum cluster queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ regionId: "RegionOne" });
    mocks.magnumDetailApiVersion.mockResolvedValue("container-infra 1.12");
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
        apiVersion: "container-infra 1.12",
        endpointOverride: "https://magnum.example.test/v1",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/cluster-a/nodegroups",
        endpointOverride: "https://magnum.example.test/v1",
      }),
    );
    expect(mocks.magnumDetailApiVersion).toHaveBeenCalledTimes(1);
  });

  it("preserves the Magnum 1.13 and 1.14 response contract", async () => {
    mocks.magnumDetailApiVersion.mockResolvedValue("container-infra 1.14");
    mocks.openstackRequest.mockImplementation(
      async ({ path }: { path: string }) => {
        if (path === "/clusters/detail") {
          return {
            clusters: [
              {
                uuid: "cluster-a",
                name: "ours",
                project_id: "project-a",
                cluster_id: "driver-neutral-infrastructure-a",
                status: "CREATE_COMPLETE",
              },
            ],
          };
        }
        if (path === "/clusters/cluster-a/nodegroups") {
          return {
            nodegroups: [
              {
                uuid: "nodegroup-a",
                name: "workers",
                node_count: 2,
                node_labels: { workload: "general" },
                node_taints: [
                  {
                    key: "workload",
                    value: "general",
                    effect: "NoSchedule",
                  },
                ],
              },
            ],
          };
        }
        throw new Error(`Unexpected Magnum path: ${path}`);
      },
    );

    const [cluster] = await listClusters({}, "RegionOne", "project-a");

    expect(cluster).toMatchObject({
      cluster_id: "driver-neutral-infrastructure-a",
      nodegroups: [
        {
          node_labels: { workload: "general" },
          node_taints: [
            {
              key: "workload",
              value: "general",
              effect: "NoSchedule",
            },
          ],
        },
      ],
    });
    expect(cluster).not.toHaveProperty("stack_id");
    expect(
      mocks.openstackRequest.mock.calls.every(
        ([options]) => options.apiVersion === "container-infra 1.14",
      ),
    ).toBe(true);
    expect(mocks.magnumDetailApiVersion).toHaveBeenCalledTimes(1);
  });

  it("keeps trusted endpoint affinity for detailed node-group reads", async () => {
    mocks.magnumDetailApiVersion.mockResolvedValue("container-infra 1.14");
    mocks.openstackRequest.mockImplementation(
      async ({ path }: { path: string }) => {
        if (path === "/clusters/cluster-a/nodegroups") {
          return {
            nodegroups: [
              {
                uuid: "nodegroup-a",
                name: "workers",
                node_count: 2,
              },
            ],
          };
        }
        if (path === "/clusters/cluster-a/nodegroups/nodegroup-a") {
          return {
            nodegroup: {
              uuid: "nodegroup-a",
              name: "workers",
              node_count: 2,
              node_labels: { workload: "general" },
              node_taints: [],
            },
          };
        }
        throw new Error(`Unexpected Magnum path: ${path}`);
      },
    );

    const result = await listClusterNodeGroups(
      "cluster-a",
      "RegionOne",
      true,
      "https://magnum.example.test/v1",
    );

    expect(result).toEqual([
      expect.objectContaining({
        uuid: "nodegroup-a",
        node_labels: { workload: "general" },
      }),
    ]);
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(2);
    expect(
      mocks.openstackRequest.mock.calls.every(
        ([options]) =>
          options.apiVersion === "container-infra 1.14" &&
          options.endpointOverride === "https://magnum.example.test/v1",
      ),
    ).toBe(true);
    expect(mocks.magnumDetailApiVersion).toHaveBeenCalledTimes(1);
  });

  it("preserves deployment-resolved cluster-template driver metadata", async () => {
    mocks.magnumDetailApiVersion.mockResolvedValue("container-infra 1.14");
    mocks.openstackRequest.mockResolvedValue({
      clustertemplate: {
        uuid: "template-a",
        name: "capi-template",
        coe: "kubernetes",
        driver: "k8s_capi_helm_v1",
        hidden: true,
      },
    });

    await expect(
      getClusterTemplate("template-a", "RegionOne"),
    ).resolves.toMatchObject({
      driver: "k8s_capi_helm_v1",
      hidden: true,
    });
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clustertemplates/template-a",
        apiVersion: "container-infra 1.14",
      }),
    );
  });
});
