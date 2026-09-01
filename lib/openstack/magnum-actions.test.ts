import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
  getClusterNodeGroupAction: vi.fn(),
}));

vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));

vi.mock("@/lib/openstack/magnum", () => ({
  getClusterNodeGroupAction: mocks.getClusterNodeGroupAction,
}));

import {
  createClusterAction,
  createClusterNodeGroupAction,
  createClusterTemplateAction,
  deleteClusterAction,
  deleteClusterNodeGroupAction,
  deleteClusterTemplateAction,
  resizeClusterAction,
  signClusterCertificateAction,
  updateClusterNodeGroupAction,
  updateClusterTemplateAction,
  upgradeClusterAction,
} from "@/lib/openstack/magnum-actions";
import {
  buildClusterTemplateLabels,
  buildClusterTemplateRequest,
  resolveClusterTemplateDnsNameserver,
} from "@/lib/openstack/magnum-template";
import type {
  MagnumClusterTemplate,
  MagnumClusterTemplateMutationInput,
} from "@/types/openstack";

const scope = { projectId: "project-a", regionId: "RegionOne" };

function input(
  overrides: Partial<MagnumClusterTemplateMutationInput> = {},
): MagnumClusterTemplateMutationInput {
  return {
    name: "k8s-v1.35.4",
    imageId: "image-a",
    kubernetesVersion: "1.35.4",
    workerFlavorId: "m1.medium",
    controlPlaneFlavorId: "m1.medium",
    networkDriver: "cilium",
    externalNetworkId: "public",
    dnsNameserver: "10.13.55.1",
    public: false,
    masterLoadBalancerEnabled: true,
    apiFloatingIpEnabled: true,
    autoHealingEnabled: true,
    autoScalingEnabled: false,
    ciliumHubbleUiEnabled: false,
    podCidr: "10.100.0.0/16",
    serviceCidr: "10.254.0.0/16",
    clusterDomain: "cluster.local",
    differentFailureDomain: false,
    octaviaLbHealthcheck: true,
    cinderCsiEnabled: true,
    manilaCsiEnabled: true,
    manilaCsiShareNetworkId: "share-network-a",
    keystoneAuthEnabled: true,
    auditLogEnabled: false,
    ...overrides,
  };
}

function template(
  value: MagnumClusterTemplateMutationInput = input(),
): MagnumClusterTemplate {
  return {
    uuid: "template-a",
    ...buildClusterTemplateRequest(value),
  } as unknown as MagnumClusterTemplate;
}

describe("Magnum cluster template mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: null,
      message: "done",
      scope,
    });
  });

  it("resolves optional DNS from subnet DHCP with a safe driver fallback", () => {
    expect(
      resolveClusterTemplateDnsNameserver("", ["10.13.55.1", " 10.13.55.2 "]),
    ).toBe("10.13.55.1,10.13.55.2");
    expect(
      resolveClusterTemplateDnsNameserver(" 9.9.9.9 ", ["10.13.55.1"]),
    ).toBe("9.9.9.9");
    expect(resolveClusterTemplateDnsNameserver(undefined)).toBe("1.1.1.1");
  });

  it("creates a Kubernetes-only CAPI template with a full version", async () => {
    await createClusterTemplateAction(scope, input());

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/clustertemplates",
        apiVersion: "container-infra latest",
        body: expect.objectContaining({
          coe: "kubernetes",
          server_type: "vm",
          labels: expect.objectContaining({
            kube_tag: "v1.35.4",
            cilium_ipv4pool: "10.100.0.0/16",
            manila_csi_share_network_id: "share-network-a",
          }),
        }),
      }),
    );
  });

  it("uses the selected CNI pool and preserves unknown labels", () => {
    const labels = buildClusterTemplateLabels(
      input({
        networkDriver: "calico",
        customLabels: {
          cilium_ipv4pool: "stale",
          vendor_extension: "preserved",
        },
      }),
    );

    expect(labels.calico_ipv4pool).toBe("10.100.0.0/16");
    expect(labels.cilium_ipv4pool).toBeUndefined();
    expect(labels.vendor_extension).toBe("preserved");
  });

  it("omits unedited driver defaults from labels", () => {
    const labels = buildClusterTemplateLabels(
      input({
        podCidr: "",
        serviceCidr: "",
        clusterDomain: "",
        manilaCsiEnabled: true,
        manilaCsiShareNetworkId: "",
      }),
    );

    expect(labels).toEqual({ kube_tag: "v1.35.4" });
  });

  it("allows a template to leave DNS and a Manila share network unset", async () => {
    await createClusterTemplateAction(
      scope,
      input({ dnsNameserver: "", manilaCsiShareNetworkId: "" }),
    );

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ dns_nameserver: null }),
      }),
    );
  });

  it("serializes source-backed driver overrides without materializing defaults", () => {
    const labels = buildClusterTemplateLabels(
      input({
        cniVersion: "v1.18.0",
        ciliumHubbleUiEnabled: true,
        fixedSubnetCidr: "10.42.0.0/24",
        apiServerFloatingIp: "203.0.113.10",
        apiServerCertSans: "kubernetes.example.test,203.0.113.10",
        admissionControlList: "PodSecurity",
        differentFailureDomain: true,
        serverGroupPolicies: "anti-affinity",
        octaviaProvider: "ovn",
        octaviaLbAlgorithm: "SOURCE_IP_PORT",
        octaviaLbHealthcheck: false,
        apiServerLbFlavor: "api-small",
        cinderCsiPluginTag: "v1.35.0",
        cloudProviderTag: "v1.35.0",
        csiSnapshotterTag: "v8.2.0",
      }),
    );

    expect(labels).toMatchObject({
      cilium_tag: "v1.18.0",
      cilium_hubble_ui_enabled: "true",
      fixed_subnet_cidr: "10.42.0.0/24",
      api_server_floating_ip: "203.0.113.10",
      api_server_cert_sans: "kubernetes.example.test,203.0.113.10",
      admission_control_list: "PodSecurity",
      different_failure_domain: "true",
      server_group_policies: "anti-affinity",
      octavia_provider: "ovn",
      octavia_lb_algorithm: "SOURCE_IP_PORT",
      octavia_lb_healthcheck: "false",
      api_server_lb_flavor: "api-small",
      cinder_csi_plugin_tag: "v1.35.0",
      cloud_provider_tag: "v1.35.0",
      csi_snapshotter_tag: "v8.2.0",
    });
    expect(labels).not.toHaveProperty("auto_healing_enabled");
    expect(labels).not.toHaveProperty("auto_scaling_enabled");
    expect(labels).not.toHaveProperty("cinder_csi_enabled");
    expect(labels).not.toHaveProperty("manila_csi_enabled");
  });

  it("sends JSON Patch operations for an edit", async () => {
    await updateClusterTemplateAction(
      scope,
      "template-a",
      input({ name: "production" }),
      template(),
    );

    const call = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(call).toMatchObject({
      method: "PATCH",
      path: "/clustertemplates/template-a",
    });
    expect(call.body).toEqual([
      { op: "replace", path: "/name", value: "production" },
    ]);
  });

  it("serializes changed labels for Magnum JSON Patch", async () => {
    const original = input();
    await updateClusterTemplateAction(
      scope,
      "template-a",
      input({ autoScalingEnabled: true }),
      template(original),
    );

    const labelsOperation =
      mocks.executeOpenStackMutation.mock.calls[0][0].body[0];
    expect(labelsOperation).toMatchObject({
      op: "replace",
      path: "/labels",
    });
    expect(JSON.parse(labelsOperation.value)).toMatchObject({
      auto_scaling_enabled: "true",
      kube_tag: "v1.35.4",
    });
  });

  it("deletes a cluster template by UUID", async () => {
    await deleteClusterTemplateAction(scope, "template-a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/clustertemplates/template-a",
        apiVersion: "container-infra latest",
      }),
    );
  });

  it("rejects a version without a patch component", async () => {
    const result = await createClusterTemplateAction(
      scope,
      input({ kubernetesVersion: "1.35" }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects prefixed and prerelease Kubernetes versions", async () => {
    for (const kubernetesVersion of ["v1.35.4", "1.35.4-rc.1"]) {
      const result = await createClusterTemplateAction(
        scope,
        input({ kubernetesVersion }),
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "validation-failed" },
      });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires the external network used by the current CAPI driver", async () => {
    const invalid = await createClusterTemplateAction(
      scope,
      input({ externalNetworkId: "" }),
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        message:
          "Select the external network required by the current Cluster API driver.",
      },
    });

    const privateApi = await createClusterTemplateAction(
      scope,
      input({ apiFloatingIpEnabled: false, externalNetworkId: "" }),
    );
    expect(privateApi).toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("accepts blank network ranges to inherit driver defaults", async () => {
    await createClusterTemplateAction(
      scope,
      input({
        podCidr: "",
        serviceCidr: "",
        clusterDomain: "",
      }),
    );

    const body = mocks.executeOpenStackMutation.mock.calls[0][0].body;
    expect(body.labels).not.toHaveProperty("cilium_ipv4pool");
    expect(body.labels).not.toHaveProperty("service_cluster_ip_range");
    expect(body.labels).not.toHaveProperty("dns_cluster_domain");
  });

  it("returns a field-specific message for an empty name", async () => {
    const result = await createClusterTemplateAction(
      scope,
      input({ name: "" }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Enter a template name." },
    });
  });
});

describe("Magnum cluster lifecycle mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: null,
      message: "done",
      scope,
    });
  });

  it("creates a cluster with explicit capacity and inherited optional settings", async () => {
    await createClusterAction(scope, {
      name: "production-k8s",
      clusterTemplateId: "template-a",
      networkDriver: "cilium",
      controlPlaneCount: 3,
      workerCount: 2,
      createTimeout: 60,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/clusters",
        body: {
          name: "production-k8s",
          cluster_template_id: "template-a",
          master_count: 3,
          node_count: 2,
          create_timeout: 60,
          keypair: undefined,
          master_flavor_id: undefined,
          flavor_id: undefined,
          fixed_network: undefined,
          fixed_subnet: undefined,
          master_lb_enabled: undefined,
          floating_ip_enabled: undefined,
        },
      }),
    );
  });

  it("rejects an even control-plane count", async () => {
    const result = await createClusterAction(scope, {
      name: "production-k8s",
      clusterTemplateId: "template-a",
      networkDriver: "cilium",
      controlPlaneCount: 2,
      workerCount: 2,
      createTimeout: 60,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Control-plane size must be an odd number." },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires project-scoped Manila and OIDC settings at cluster creation", async () => {
    const missingShareNetwork = await createClusterAction(scope, {
      name: "production-k8s",
      clusterTemplateId: "template-a",
      networkDriver: "cilium",
      controlPlaneCount: 3,
      workerCount: 0,
      createTimeout: 60,
      manilaCsiEnabled: true,
    });
    expect(missingShareNetwork).toMatchObject({
      ok: false,
      error: {
        message: "Select a project Manila share network or disable Manila CSI.",
      },
    });

    const missingOidcClient = await createClusterAction(scope, {
      name: "production-k8s",
      clusterTemplateId: "template-a",
      networkDriver: "cilium",
      controlPlaneCount: 3,
      workerCount: 0,
      createTimeout: 60,
      manilaCsiEnabled: false,
      oidcIssuerUrl: "https://identity.example/realms/tenant-a",
    });
    expect(missingOidcClient).toMatchObject({
      ok: false,
      error: {
        message: "Enter an OIDC client ID for the configured issuer.",
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("resizes the selected worker node group within its bounds", async () => {
    await resizeClusterAction(scope, "cluster-a", {
      autoScalingEnabled: false,
      nodeGroup: "workers-a",
      nodeCount: 4,
      role: "worker",
      minNodeCount: 1,
      maxNodeCount: 6,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/cluster-a/actions/resize",
        body: { node_count: 4, nodegroup: "workers-a" },
      }),
    );
  });

  it("shrinks a worker node group to zero when its minimum allows it", async () => {
    await resizeClusterAction(scope, "cluster-a", {
      autoScalingEnabled: false,
      nodeGroup: "workers-a",
      nodeCount: 0,
      role: "worker",
      minNodeCount: 0,
      maxNodeCount: 6,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/cluster-a/actions/resize",
        body: { node_count: 0, nodegroup: "workers-a" },
      }),
    );
  });

  it("rejects an even control-plane resize", async () => {
    const result = await resizeClusterAction(scope, "cluster-a", {
      autoScalingEnabled: false,
      nodeGroup: "master",
      nodeCount: 2,
      role: "master",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects direct worker resize when cluster autoscaling is enabled", async () => {
    const result = await resizeClusterAction(scope, "cluster-a", {
      autoScalingEnabled: true,
      nodeGroup: "workers-a",
      nodeCount: 4,
      role: "worker",
      minNodeCount: 1,
      maxNodeCount: 6,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("Cluster Autoscaler controls"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("upgrades the whole cluster without a node-group selector", async () => {
    await upgradeClusterAction(scope, "cluster-a", {
      clusterTemplateId: "template-b",
      maxBatchSize: 2,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/clusters/cluster-a/actions/upgrade",
        body: { cluster_template: "template-b", max_batch_size: 2 },
      }),
    );
  });

  it("deletes a cluster by UUID", async () => {
    await deleteClusterAction(scope, "cluster-a");
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/clusters/cluster-a",
      }),
    );
  });

  it("signs a browser-generated client certificate request", async () => {
    const csr = [
      "-----BEGIN CERTIFICATE REQUEST-----",
      "ZmFrZS1jZXJ0aWZpY2F0ZS1yZXF1ZXN0",
      "-----END CERTIFICATE REQUEST-----",
    ].join("\n");

    await signClusterCertificateAction(scope, "cluster-a", csr);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/certificates",
        body: { cluster_uuid: "cluster-a", csr },
      }),
    );
  });

  it("rejects certificate data that is not a PKCS#10 PEM request", async () => {
    const result = await signClusterCertificateAction(
      scope,
      "cluster-a",
      "not-a-csr",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});

describe("Magnum node-group lifecycle mutations", () => {
  const nodeGroup = {
    uuid: "node-group-a",
    name: "workers-a",
    role: "worker",
    node_count: 2,
    min_node_count: 1,
    max_node_count: 4,
    is_default: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: null,
      message: "done",
      scope,
    });
    mocks.getClusterNodeGroupAction.mockResolvedValue(nodeGroup);
  });

  it("creates a node group with its RFC 1123 Kubernetes role", async () => {
    await createClusterNodeGroupAction(scope, "cluster-a", {
      name: "gpu-workers",
      role: "gpu",
      nodeCount: 2,
      minNodeCount: 1,
      maxNodeCount: 4,
      flavorId: "gpu.large",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/clusters/cluster-a/nodegroups",
        body: expect.objectContaining({
          name: "gpu-workers",
          role: "gpu",
          merge_labels: true,
          node_count: 2,
          min_node_count: 1,
          max_node_count: 4,
        }),
      }),
    );
    expect(
      mocks.executeOpenStackMutation.mock.calls[0]?.[0]?.body,
    ).not.toHaveProperty("image_id");
  });

  it("rejects node-group names outside RFC 1123", async () => {
    const result = await createClusterNodeGroupAction(scope, "cluster-a", {
      name: "GPU Workers",
      role: "worker",
      nodeCount: 1,
      minNodeCount: 0,
      maxNodeCount: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("patches only Magnum-supported node-group settings", async () => {
    await updateClusterNodeGroupAction(scope, "cluster-a", nodeGroup, {
      minNodeCount: 1,
      maxNodeCount: 5,
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/clusters/cluster-a/nodegroups/node-group-a",
        body: [{ op: "replace", path: "/max_node_count", value: 5 }],
      }),
    );
  });

  it("raises capacity before applying a higher autoscaler minimum", async () => {
    mocks.getClusterNodeGroupAction.mockResolvedValue({
      ...nodeGroup,
      node_count: 3,
      min_node_count: 2,
      max_node_count: 5,
    });

    const result = await updateClusterNodeGroupAction(
      scope,
      "cluster-a",
      nodeGroup,
      { minNodeCount: 3, maxNodeCount: 5 },
    );

    expect(result.ok).toBe(true);
    expect(
      mocks.executeOpenStackMutation.mock.calls.map(([call]) => call),
    ).toEqual([
      expect.objectContaining({
        method: "PATCH",
        body: [
          { op: "replace", path: "/min_node_count", value: 2 },
          { op: "replace", path: "/max_node_count", value: 5 },
        ],
      }),
      expect.objectContaining({
        method: "POST",
        body: { node_count: 3, nodegroup: "workers-a" },
      }),
      expect.objectContaining({
        method: "PATCH",
        body: [{ op: "replace", path: "/min_node_count", value: 3 }],
      }),
    ]);
  });

  it("shrinks capacity before applying a lower autoscaler maximum", async () => {
    mocks.getClusterNodeGroupAction.mockResolvedValue({
      ...nodeGroup,
      node_count: 1,
      min_node_count: 0,
      max_node_count: 2,
    });

    const result = await updateClusterNodeGroupAction(
      scope,
      "cluster-a",
      nodeGroup,
      { minNodeCount: 0, maxNodeCount: 1 },
    );

    expect(result.ok).toBe(true);
    expect(
      mocks.executeOpenStackMutation.mock.calls.map(([call]) => call),
    ).toEqual([
      expect.objectContaining({
        method: "PATCH",
        body: [
          { op: "replace", path: "/min_node_count", value: 0 },
          { op: "replace", path: "/max_node_count", value: 2 },
        ],
      }),
      expect.objectContaining({
        method: "POST",
        body: { node_count: 1, nodegroup: "workers-a" },
      }),
      expect.objectContaining({
        method: "PATCH",
        body: [{ op: "replace", path: "/max_node_count", value: 1 }],
      }),
    ]);
  });

  it("rejects the reserved control-plane role for additional groups", async () => {
    const result = await createClusterNodeGroupAction(scope, "cluster-a", {
      name: "extra-control-plane",
      role: "master",
      nodeCount: 1,
      minNodeCount: 1,
      maxNodeCount: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
  });

  it("refuses to delete a default node group", async () => {
    const result = await deleteClusterNodeGroupAction(scope, "cluster-a", {
      ...nodeGroup,
      is_default: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Default node groups cannot be deleted." },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("deletes a non-default worker node group", async () => {
    await deleteClusterNodeGroupAction(scope, "cluster-a", nodeGroup);

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/clusters/cluster-a/nodegroups/node-group-a",
      }),
    );
  });
});
