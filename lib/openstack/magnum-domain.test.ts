import { describe, expect, it } from "vitest";

import {
  KUBERNETES_VERSION_PATTERN,
  clusterKubernetesVersion,
  getKubernetesHealthDiagnostics,
  isMagnumCompatibleImage,
  kubernetesHealthSummary,
  kubernetesVersionTag,
  magnumImageDistribution,
  normalizeKubernetesVersion,
  serversForNodeGroup,
} from "@/lib/openstack/magnum-domain";
import type { Image, MagnumCluster, Server } from "@/types/openstack";

function cluster(overrides: Partial<MagnumCluster> = {}): MagnumCluster {
  return {
    uuid: "cluster-a",
    name: "test",
    status: "CREATE_COMPLETE",
    cluster_template_id: "template-a",
    ...overrides,
  };
}

describe("Magnum Kubernetes domain helpers", () => {
  it("accepts only an exact numeric major.minor.patch version", () => {
    expect(KUBERNETES_VERSION_PATTERN.test("1.35.4")).toBe(true);
    expect(KUBERNETES_VERSION_PATTERN.test("v1.35.4")).toBe(false);
    expect(KUBERNETES_VERSION_PATTERN.test("1.35.4-rc.1")).toBe(false);
    expect(KUBERNETES_VERSION_PATTERN.test("1.35")).toBe(false);
  });

  it("requires os_distro metadata for Magnum node images", () => {
    const image = {
      id: "image-a",
      name: "ubuntu-kubernetes",
      os_distro: "ubuntu",
      os_version: "24.04",
    } as unknown as Image;

    expect(isMagnumCompatibleImage(image)).toBe(true);
    expect(magnumImageDistribution(image)).toBe("Ubuntu 24.04");
    expect(
      isMagnumCompatibleImage({
        ...image,
        os_distro: undefined,
        os_type: "linux",
      }),
    ).toBe(false);
  });

  it("keeps the full Kubernetes patch version", () => {
    expect(normalizeKubernetesVersion("v1.35.4")).toBe("1.35.4");
    expect(kubernetesVersionTag("1.35.4")).toBe("v1.35.4");
    expect(
      clusterKubernetesVersion(
        cluster({ coe_version: "v1.35.4", labels: { kube_tag: "v1.34.8" } }),
      ),
    ).toBe("1.35.4");
  });

  it("falls back to the cluster-wide kube_tag", () => {
    expect(
      clusterKubernetesVersion(cluster({ labels: { kube_tag: "v1.34.8" } })),
    ).toBe("1.34.8");
  });

  it("turns CAPI machine readiness into an actionable issue", () => {
    const value = cluster({
      health_status: "UNHEALTHY",
      health_status_reason: {
        "control-0.Ready": "True",
        "worker-0.Ready": "False",
        api: "ok",
      },
    });

    expect(getKubernetesHealthDiagnostics(value)).toMatchObject({
      apiReady: true,
      machineCount: 2,
      readyMachineCount: 1,
      issues: [
        {
          resource: "worker-0",
          resourceType: "Machine",
          state: "False",
        },
      ],
    });
    expect(kubernetesHealthSummary(value)).toBe("worker-0 is not ready");
  });

  it("reports an API readiness failure separately", () => {
    const diagnostics = getKubernetesHealthDiagnostics(
      cluster({
        health_status: "UNHEALTHY",
        health_status_reason: { api: "nok" },
      }),
    );

    expect(diagnostics.apiReady).toBe(false);
    expect(diagnostics.issues[0]).toMatchObject({
      resource: "Kubernetes API",
      resourceType: "API server",
    });
  });

  it("matches node-group addresses to Nova instances", () => {
    const servers = [
      {
        id: "server-a",
        addresses: { private: [{ addr: "10.0.0.12" }] },
      },
      {
        id: "server-b",
        addresses: { private: [{ addr: "10.0.0.13" }] },
      },
    ] as unknown as Server[];

    expect(
      serversForNodeGroup(
        {
          name: "workers",
          role: "worker",
          node_addresses: ["10.0.0.13"],
        },
        servers,
      ).map(({ id }) => id),
    ).toEqual(["server-b"]);
  });

  it("falls back to CAPI stack and node-group instance names", () => {
    const servers = [
      { id: "control", name: "kube-abcd-7d8f9", addresses: {} },
      {
        id: "worker",
        name: "kube-abcd-workers-b-kzz5p",
        addresses: {},
      },
      { id: "other", name: "unrelated", addresses: {} },
    ] as unknown as Server[];
    const groups = [
      { name: "default-master", role: "master" },
      { name: "workers-b", role: "worker" },
    ];

    expect(
      serversForNodeGroup(
        groups[1],
        servers,
        { stack_id: "kube-abcd" },
        groups,
      ).map(({ id }) => id),
    ).toEqual(["worker"]);
    expect(
      serversForNodeGroup(
        groups[0],
        servers,
        { stack_id: "kube-abcd" },
        groups,
      ).map(({ id }) => id),
    ).toEqual(["control"]);
  });
});
