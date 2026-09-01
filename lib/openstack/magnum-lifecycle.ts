import type {
  MagnumClusterMutationInput,
  MagnumClusterNodeGroup,
  MagnumClusterResizeInput,
  MagnumClusterUpgradeInput,
  MagnumNodeGroupMutationInput,
  MagnumNodeGroupUpdateInput,
} from "@/types/openstack";

type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function clusterLabels(input: MagnumClusterMutationInput) {
  return Object.fromEntries(
    Object.entries({
      [input.networkDriver === "cilium"
        ? "cilium_ipv4pool"
        : "calico_ipv4pool"]: optionalText(input.podCidr),
      service_cluster_ip_range: optionalText(input.serviceCidr),
      fixed_subnet_cidr: optionalText(input.fixedSubnetCidr),
      master_lb_floating_ip_enabled:
        input.apiFloatingIpEnabled === undefined
          ? undefined
          : String(input.apiFloatingIpEnabled),
      api_server_floating_ip:
        input.apiFloatingIpEnabled === false
          ? undefined
          : optionalText(input.apiServerFloatingIp),
      api_server_cert_sans: optionalText(input.apiServerCertSans),
      availability_zone: optionalText(input.availabilityZone),
      control_plane_availability_zones: optionalText(
        input.controlPlaneAvailabilityZones,
      ),
      api_server_lb_availability_zone: optionalText(
        input.apiServerLbAvailabilityZone,
      ),
      boot_volume_type: optionalText(input.bootVolumeType),
      boot_volume_availability_zone: optionalText(
        input.bootVolumeAvailabilityZone,
      ),
      manila_csi_enabled:
        input.manilaCsiEnabled === undefined
          ? undefined
          : String(input.manilaCsiEnabled),
      manila_csi_share_network_id:
        input.manilaCsiEnabled === false
          ? undefined
          : optionalText(input.manilaCsiShareNetworkId),
      oidc_issuer_url: optionalText(input.oidcIssuerUrl),
      oidc_client_id: optionalText(input.oidcClientId),
      oidc_username_claim: optionalText(input.oidcUsernameClaim),
      oidc_username_prefix: optionalText(input.oidcUsernamePrefix),
      oidc_groups_claim: optionalText(input.oidcGroupsClaim),
      oidc_groups_prefix: optionalText(input.oidcGroupsPrefix),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function buildClusterRequest(input: MagnumClusterMutationInput) {
  const labels = clusterLabels(input);
  return {
    name: input.name.trim(),
    cluster_template_id: input.clusterTemplateId,
    master_count: input.controlPlaneCount,
    node_count: input.workerCount,
    create_timeout: input.createTimeout,
    keypair: optionalText(input.keypair),
    master_flavor_id: optionalText(input.controlPlaneFlavorId),
    flavor_id: optionalText(input.workerFlavorId),
    fixed_network: optionalText(input.fixedNetwork),
    fixed_subnet: optionalText(input.fixedSubnet),
    master_lb_enabled: input.masterLoadBalancerEnabled,
    floating_ip_enabled: input.apiFloatingIpEnabled,
    ...(Object.keys(labels).length ? { merge_labels: true, labels } : {}),
  };
}

export function buildClusterResizeRequest(input: MagnumClusterResizeInput) {
  return {
    node_count: input.nodeCount,
    nodegroup: input.nodeGroup,
  };
}

export function buildClusterUpgradeRequest(input: MagnumClusterUpgradeInput) {
  return {
    cluster_template: input.clusterTemplateId,
    ...(input.maxBatchSize ? { max_batch_size: input.maxBatchSize } : {}),
  };
}

function nodeGroupLabels(input: MagnumNodeGroupMutationInput) {
  return {
    ...(optionalText(input.availabilityZone)
      ? { availability_zone: input.availabilityZone!.trim() }
      : {}),
    ...(optionalText(input.serverGroupPolicies)
      ? { server_group_policies: input.serverGroupPolicies!.trim() }
      : {}),
  };
}

export function buildNodeGroupRequest(input: MagnumNodeGroupMutationInput) {
  const labels = nodeGroupLabels(input);
  return {
    name: input.name.trim(),
    role: input.role.trim(),
    node_count: input.nodeCount,
    min_node_count: input.minNodeCount,
    max_node_count: input.maxNodeCount,
    flavor_id: optionalText(input.flavorId),
    merge_labels: true,
    ...(Object.keys(labels).length ? { labels } : {}),
  };
}

export type NodeGroupAutoscalerTransition =
  | {
      type: "bounds";
      minNodeCount: number;
      maxNodeCount: number;
    }
  | { type: "resize"; nodeCount: number };

export function planNodeGroupAutoscalerTransition(
  nodeGroup: MagnumClusterNodeGroup,
  input: MagnumNodeGroupUpdateInput,
): NodeGroupAutoscalerTransition[] {
  const currentMinimum = nodeGroup.min_node_count ?? 0;
  const currentMaximum = nodeGroup.max_node_count ?? currentMinimum + 1;
  const targetMaximum = input.maxNodeCount;
  const targetMinimum = input.minNodeCount;
  const currentCount = nodeGroup.node_count;

  if (currentMinimum === targetMinimum && currentMaximum === targetMaximum) {
    return [];
  }

  const preparationMinimum = Math.min(targetMinimum, currentCount);
  const preparationMaximum = Math.max(
    targetMaximum,
    currentCount,
    targetMinimum,
  );
  const transitions: NodeGroupAutoscalerTransition[] = [];

  if (
    currentMinimum !== preparationMinimum ||
    currentMaximum !== preparationMaximum
  ) {
    transitions.push({
      type: "bounds",
      minNodeCount: preparationMinimum,
      maxNodeCount: preparationMaximum,
    });
  }

  const targetCount =
    currentCount < targetMinimum
      ? targetMinimum
      : currentCount > targetMaximum
        ? targetMaximum
        : currentCount;
  if (targetCount !== currentCount) {
    transitions.push({ type: "resize", nodeCount: targetCount });
  }

  if (
    preparationMinimum !== targetMinimum ||
    preparationMaximum !== targetMaximum
  ) {
    transitions.push({
      type: "bounds",
      minNodeCount: targetMinimum,
      maxNodeCount: targetMaximum,
    });
  }

  return transitions;
}

function patchValue(
  patch: JsonPatchOperation[],
  path: string,
  current: unknown,
  next: unknown,
) {
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  patch.push({ op: "replace", path, value: next });
}

export function buildNodeGroupPatch(
  input: MagnumNodeGroupUpdateInput,
  current: MagnumClusterNodeGroup,
) {
  const patch: JsonPatchOperation[] = [];
  patchValue(
    patch,
    "/min_node_count",
    current.min_node_count ?? 0,
    input.minNodeCount,
  );
  patchValue(
    patch,
    "/max_node_count",
    current.max_node_count ?? (current.min_node_count ?? 0) + 1,
    input.maxNodeCount,
  );
  return patch;
}
