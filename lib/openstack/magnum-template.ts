import { kubernetesVersionTag } from "@/lib/openstack/magnum-domain";
import type {
  MagnumClusterTemplate,
  MagnumClusterTemplateMutationInput,
} from "@/types/openstack";

export type MagnumTemplatePatchOperation = {
  op: "add" | "remove" | "replace";
  path: string;
  value?: boolean | number | string;
};

function compactRecord(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function resolveClusterTemplateDnsNameserver(
  explicit: string | undefined,
  subnetResolvers: string[] = [],
) {
  const configured = explicit?.trim();
  if (configured) return configured;

  const inherited = subnetResolvers
    .map((resolver) => resolver.trim())
    .filter(Boolean)
    .join(",");
  return inherited || "1.1.1.1";
}

export function buildClusterTemplateLabels(
  input: MagnumClusterTemplateMutationInput,
) {
  const labels = compactRecord({
    ...(input.customLabels ?? {}),
    kube_tag: kubernetesVersionTag(input.kubernetesVersion),
    auto_healing_enabled: input.autoHealingEnabled ? undefined : "false",
    auto_scaling_enabled: input.autoScalingEnabled ? "true" : undefined,
    master_lb_floating_ip_enabled: input.apiFloatingIpEnabled
      ? undefined
      : "false",
    [input.networkDriver === "cilium" ? "cilium_tag" : "calico_tag"]:
      input.cniVersion || undefined,
    cilium_hubble_ui_enabled:
      input.networkDriver === "cilium" && input.ciliumHubbleUiEnabled
        ? "true"
        : undefined,
    [input.networkDriver === "cilium" ? "cilium_ipv4pool" : "calico_ipv4pool"]:
      input.podCidr || undefined,
    service_cluster_ip_range: input.serviceCidr || undefined,
    dns_cluster_domain: input.clusterDomain || undefined,
    fixed_subnet_cidr: input.fixedSubnetCidr || undefined,
    api_server_floating_ip:
      input.apiFloatingIpEnabled && input.apiServerFloatingIp
        ? input.apiServerFloatingIp
        : undefined,
    api_server_cert_sans: input.apiServerCertSans || undefined,
    api_server_tls_cipher_suites: input.apiServerTlsCipherSuites || undefined,
    kubelet_tls_cipher_suites: input.kubeletTlsCipherSuites || undefined,
    admission_control_list: input.admissionControlList || undefined,
    availability_zone: input.availabilityZone || undefined,
    control_plane_availability_zones:
      input.controlPlaneAvailabilityZones || undefined,
    different_failure_domain: input.differentFailureDomain ? "true" : undefined,
    server_group_policies: input.serverGroupPolicies || undefined,
    octavia_provider: input.octaviaProvider || undefined,
    octavia_lb_algorithm: input.octaviaLbAlgorithm || undefined,
    octavia_lb_healthcheck: input.octaviaLbHealthcheck ? undefined : "false",
    api_server_lb_flavor: input.apiServerLbFlavor || undefined,
    api_server_lb_availability_zone:
      input.apiServerLbAvailabilityZone || undefined,
    boot_volume_size: input.bootVolumeSize
      ? String(input.bootVolumeSize)
      : undefined,
    boot_volume_type: input.bootVolumeType || undefined,
    boot_volume_availability_zone:
      input.bootVolumeAvailabilityZone || undefined,
    docker_volume_type: input.dockerVolumeType || undefined,
    etcd_volume_size:
      input.etcdVolumeSize === undefined
        ? undefined
        : String(input.etcdVolumeSize),
    etcd_volume_type: input.etcdVolumeType || undefined,
    cinder_csi_enabled: input.cinderCsiEnabled ? undefined : "false",
    cinder_csi_plugin_tag: input.cinderCsiPluginTag || undefined,
    manila_csi_enabled: input.manilaCsiEnabled ? undefined : "false",
    manila_csi_plugin_tag: input.manilaCsiPluginTag || undefined,
    manila_csi_share_network_id:
      input.manilaCsiEnabled && input.manilaCsiShareNetworkId
        ? input.manilaCsiShareNetworkId
        : undefined,
    csi_attacher_tag: input.csiAttacherTag || undefined,
    csi_liveness_probe_tag: input.csiLivenessProbeTag || undefined,
    csi_node_driver_registrar_tag: input.csiNodeDriverRegistrarTag || undefined,
    csi_provisioner_tag: input.csiProvisionerTag || undefined,
    csi_resizer_tag: input.csiResizerTag || undefined,
    csi_snapshotter_tag: input.csiSnapshotterTag || undefined,
    cloud_provider_tag: input.cloudProviderTag || undefined,
    container_infra_prefix: input.containerInfraPrefix || undefined,
    keystone_auth_enabled: input.keystoneAuthEnabled ? undefined : "false",
    audit_log_enabled: input.auditLogEnabled ? "true" : undefined,
    audit_log_max_age:
      !input.auditLogEnabled || input.auditLogMaxAge === undefined
        ? undefined
        : String(input.auditLogMaxAge),
    audit_log_max_backup:
      !input.auditLogEnabled || input.auditLogMaxBackup === undefined
        ? undefined
        : String(input.auditLogMaxBackup),
    audit_log_max_size:
      !input.auditLogEnabled || input.auditLogMaxSize === undefined
        ? undefined
        : String(input.auditLogMaxSize),
    oidc_issuer_url: input.oidcIssuerUrl || undefined,
    oidc_client_id: input.oidcClientId || undefined,
    oidc_username_claim: input.oidcUsernameClaim || undefined,
    oidc_username_prefix: input.oidcUsernamePrefix || undefined,
    oidc_groups_claim: input.oidcGroupsClaim || undefined,
    oidc_groups_prefix: input.oidcGroupsPrefix || undefined,
  });

  const otherCniPool =
    input.networkDriver === "cilium" ? "calico_ipv4pool" : "cilium_ipv4pool";
  const otherCniTag =
    input.networkDriver === "cilium" ? "calico_tag" : "cilium_tag";
  delete labels[otherCniPool];
  delete labels[otherCniTag];

  return labels;
}

export function buildClusterTemplateRequest(
  input: MagnumClusterTemplateMutationInput,
) {
  return {
    name: input.name,
    coe: "kubernetes",
    server_type: "vm",
    image_id: input.imageId,
    flavor_id: input.workerFlavorId,
    master_flavor_id: input.controlPlaneFlavorId,
    network_driver: input.networkDriver,
    external_network_id: input.externalNetworkId || null,
    dns_nameserver: input.dnsNameserver?.trim() || null,
    fixed_network: input.fixedNetwork || null,
    fixed_subnet: input.fixedSubnet || null,
    public: input.public,
    master_lb_enabled: input.masterLoadBalancerEnabled,
    floating_ip_enabled: input.apiFloatingIpEnabled,
    docker_storage_driver: "overlay2",
    tls_disabled: false,
    registry_enabled: false,
    http_proxy: input.httpProxy || null,
    https_proxy: input.httpsProxy || null,
    no_proxy: input.noProxy || null,
    labels: buildClusterTemplateLabels(input),
  };
}

export function buildClusterTemplatePatch(
  input: MagnumClusterTemplateMutationInput,
  current: MagnumClusterTemplate,
): MagnumTemplatePatchOperation[] {
  const desired = buildClusterTemplateRequest(input);
  const existing = current as unknown as Record<string, unknown>;
  const operations: MagnumTemplatePatchOperation[] = [];

  for (const [key, value] of Object.entries(desired)) {
    if (key === "coe" || key === "server_type") continue;

    const currentValue = existing[key];
    if (valuesMatch(currentValue, value)) continue;

    if (value === null) {
      if (currentValue !== null && currentValue !== undefined) {
        operations.push({ op: "remove", path: `/${key}` });
      }
      continue;
    }

    const patchValue = key === "labels" ? JSON.stringify(value) : value;
    if (
      typeof patchValue !== "boolean" &&
      typeof patchValue !== "number" &&
      typeof patchValue !== "string"
    ) {
      continue;
    }

    operations.push({
      op:
        currentValue === null || currentValue === undefined ? "add" : "replace",
      path: `/${key}`,
      value: patchValue,
    });
  }

  return operations;
}

function valuesMatch(current: unknown, desired: unknown) {
  if (current === desired) return true;
  if (
    current &&
    desired &&
    typeof current === "object" &&
    typeof desired === "object"
  ) {
    const sorted = (value: object) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      );
    return sorted(current) === sorted(desired);
  }
  return false;
}
