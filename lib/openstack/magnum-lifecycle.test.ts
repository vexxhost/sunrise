import { describe, expect, it } from "vitest";
import {
  buildClusterRequest,
  buildClusterUpgradeRequest,
  buildNodeGroupPatch,
  buildNodeGroupRequest,
  planNodeGroupAutoscalerTransition,
} from "@/lib/openstack/magnum-lifecycle";

describe("Magnum lifecycle request builders", () => {
  it("trims cluster identity and preserves explicit flavor overrides", () => {
    expect(
      buildClusterRequest({
        name: " demo-k8s ",
        clusterTemplateId: "template-a",
        networkDriver: "cilium",
        controlPlaneCount: 3,
        workerCount: 2,
        createTimeout: 90,
        keypair: " operator ",
        controlPlaneFlavorId: "m1.large",
        workerFlavorId: "m1.medium",
      }),
    ).toEqual({
      name: "demo-k8s",
      cluster_template_id: "template-a",
      master_count: 3,
      node_count: 2,
      create_timeout: 90,
      keypair: "operator",
      master_flavor_id: "m1.large",
      flavor_id: "m1.medium",
      fixed_network: undefined,
      fixed_subnet: undefined,
      master_lb_enabled: undefined,
      floating_ip_enabled: undefined,
    });
  });

  it("emits only explicit cluster network and CAPI label overrides", () => {
    expect(
      buildClusterRequest({
        name: "mesh-b",
        clusterTemplateId: "template-a",
        networkDriver: "cilium",
        controlPlaneCount: 3,
        workerCount: 1,
        createTimeout: 60,
        fixedNetwork: "network-b",
        fixedSubnet: "subnet-b",
        masterLoadBalancerEnabled: true,
        apiFloatingIpEnabled: false,
        podCidr: "10.110.0.0/16",
        serviceCidr: "10.255.0.0/16",
      }),
    ).toMatchObject({
      fixed_network: "network-b",
      fixed_subnet: "subnet-b",
      master_lb_enabled: true,
      floating_ip_enabled: false,
      merge_labels: true,
      labels: {
        cilium_ipv4pool: "10.110.0.0/16",
        service_cluster_ip_range: "10.255.0.0/16",
        master_lb_floating_ip_enabled: "false",
      },
    });
  });

  it("emits cluster-scoped identity and Manila overrides", () => {
    expect(
      buildClusterRequest({
        name: "tenant-a",
        clusterTemplateId: "template-a",
        networkDriver: "cilium",
        controlPlaneCount: 3,
        workerCount: 0,
        createTimeout: 60,
        apiServerFloatingIp: "203.0.113.10",
        apiServerCertSans: "api.tenant-a.example",
        availabilityZone: "nova-2",
        controlPlaneAvailabilityZones: "nova-1,nova-2",
        apiServerLbAvailabilityZone: "octavia-a",
        bootVolumeType: "fast-ssd",
        bootVolumeAvailabilityZone: "cinder-a",
        manilaCsiEnabled: true,
        manilaCsiShareNetworkId: "share-network-a",
        oidcIssuerUrl: "https://identity.example/realms/tenant-a",
        oidcClientId: "kubernetes",
      }),
    ).toMatchObject({
      merge_labels: true,
      labels: {
        api_server_floating_ip: "203.0.113.10",
        api_server_cert_sans: "api.tenant-a.example",
        availability_zone: "nova-2",
        control_plane_availability_zones: "nova-1,nova-2",
        api_server_lb_availability_zone: "octavia-a",
        boot_volume_type: "fast-ssd",
        boot_volume_availability_zone: "cinder-a",
        manila_csi_enabled: "true",
        manila_csi_share_network_id: "share-network-a",
        oidc_issuer_url: "https://identity.example/realms/tenant-a",
        oidc_client_id: "kubernetes",
      },
    });
  });

  it("does not send a Magnum node-group selector for CAPI upgrades", () => {
    expect(
      buildClusterUpgradeRequest({
        clusterTemplateId: "template-b",
        maxBatchSize: 3,
      }),
    ).toEqual({ cluster_template: "template-b", max_batch_size: 3 });
  });

  it("creates worker groups and only emits explicit CAPI label overrides", () => {
    expect(
      buildNodeGroupRequest({
        name: "workers-b",
        role: "batch",
        nodeCount: 2,
        minNodeCount: 1,
        maxNodeCount: 5,
        availabilityZone: "nova-2",
      }),
    ).toMatchObject({
      name: "workers-b",
      role: "batch",
      merge_labels: true,
      labels: { availability_zone: "nova-2" },
    });
  });

  it("plans valid intermediate states when an autoscaler range moves", () => {
    const nodeGroup = {
      uuid: "node-group-a",
      name: "workers-a",
      role: "worker",
      node_count: 2,
      min_node_count: 1,
      max_node_count: 4,
    };

    expect(
      planNodeGroupAutoscalerTransition(nodeGroup, {
        minNodeCount: 3,
        maxNodeCount: 5,
      }),
    ).toEqual([
      { type: "bounds", minNodeCount: 2, maxNodeCount: 5 },
      { type: "resize", nodeCount: 3 },
      { type: "bounds", minNodeCount: 3, maxNodeCount: 5 },
    ]);

    expect(
      planNodeGroupAutoscalerTransition(nodeGroup, {
        minNodeCount: 0,
        maxNodeCount: 1,
      }),
    ).toEqual([
      { type: "bounds", minNodeCount: 0, maxNodeCount: 2 },
      { type: "resize", nodeCount: 1 },
      { type: "bounds", minNodeCount: 0, maxNodeCount: 1 },
    ]);
  });

  it("builds a minimal patch for supported node-group settings", () => {
    expect(
      buildNodeGroupPatch(
        {
          minNodeCount: 1,
          maxNodeCount: 6,
        },
        {
          uuid: "node-group-a",
          name: "workers-a",
          node_count: 2,
          min_node_count: 1,
          max_node_count: 4,
          node_labels: { workload: "batch" },
          node_taints: [],
        },
      ),
    ).toEqual([{ op: "replace", path: "/max_node_count", value: 6 }]);
  });
});
