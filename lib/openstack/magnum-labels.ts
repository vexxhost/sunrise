export type MagnumDriverLabelCategory =
  | "Kubernetes"
  | "Networking"
  | "Load balancing"
  | "Placement"
  | "Storage"
  | "Identity and security"
  | "Component images";

export interface MagnumDriverLabelSpec {
  category: MagnumDriverLabelCategory;
  defaultValue: string;
  description: string;
  key: string;
  label: string;
}

export type MagnumNodeGroupLabelSpec = MagnumDriverLabelSpec;

export const MAGNUM_DRIVER_LABELS: MagnumDriverLabelSpec[] = [
  {
    category: "Kubernetes",
    key: "kube_tag",
    label: "Kubernetes version",
    defaultValue: "Required template value",
    description: "Cluster-wide Kubernetes version applied to every node group.",
  },
  {
    category: "Kubernetes",
    key: "auto_healing_enabled",
    label: "Automatic node healing",
    defaultValue: "true",
    description:
      "Allows Cluster API machine health checks to replace unhealthy nodes.",
  },
  {
    category: "Kubernetes",
    key: "auto_scaling_enabled",
    label: "Automatic worker scaling",
    defaultValue: "false",
    description:
      "Enables Cluster Autoscaler for worker node groups with scaling bounds.",
  },
  {
    category: "Kubernetes",
    key: "admission_control_list",
    label: "Additional admission plugins",
    defaultValue: "None",
    description:
      "Comma-separated plugins appended after the required NodeRestriction plugin.",
  },
  {
    category: "Networking",
    key: "cilium_ipv4pool",
    label: "Cilium pod CIDR",
    defaultValue: "10.100.0.0/16",
    description: "Pod address pool used when the template selects Cilium.",
  },
  {
    category: "Networking",
    key: "calico_ipv4pool",
    label: "Calico pod CIDR",
    defaultValue: "10.100.0.0/16",
    description: "Pod address pool used when the template selects Calico.",
  },
  {
    category: "Networking",
    key: "service_cluster_ip_range",
    label: "Service CIDR",
    defaultValue: "10.254.0.0/16",
    description: "Address range allocated to Kubernetes Services.",
  },
  {
    category: "Networking",
    key: "dns_cluster_domain",
    label: "Cluster DNS domain",
    defaultValue: "cluster.local",
    description: "DNS suffix used by Kubernetes Services.",
  },
  {
    category: "Networking",
    key: "fixed_subnet_cidr",
    label: "Automatically created subnet CIDR",
    defaultValue: "10.0.0.0/24",
    description:
      "Neutron subnet range used when Magnum creates the cluster network.",
  },
  {
    category: "Networking",
    key: "cilium_hubble_ui_enabled",
    label: "Cilium Hubble UI",
    defaultValue: "false",
    description:
      "Deploys Hubble Relay and its network-observability interface for Cilium.",
  },
  {
    category: "Networking",
    key: "master_lb_floating_ip_enabled",
    label: "Public API address",
    defaultValue: "true",
    description: "Attaches a floating IP to the Kubernetes API load balancer.",
  },
  {
    category: "Networking",
    key: "api_server_floating_ip",
    label: "Requested API floating IP",
    defaultValue: "Automatic",
    description:
      "Requests a specific IPv4 floating address for one cluster's Kubernetes API endpoint.",
  },
  {
    category: "Load balancing",
    key: "octavia_provider",
    label: "Octavia provider",
    defaultValue: "amphorav2",
    description:
      "Provider used by the OpenStack cloud controller for LoadBalancer Services.",
  },
  {
    category: "Load balancing",
    key: "octavia_lb_algorithm",
    label: "Service load balancer algorithm",
    defaultValue: "Provider default",
    description: "Algorithm used for Kubernetes LoadBalancer Services.",
  },
  {
    category: "Load balancing",
    key: "octavia_lb_healthcheck",
    label: "Service load balancer health checks",
    defaultValue: "true",
    description:
      "Enables Octavia health monitors for Kubernetes LoadBalancer members.",
  },
  {
    category: "Load balancing",
    key: "api_server_lb_flavor",
    label: "API load balancer flavor",
    defaultValue: "Cloud default",
    description: "Octavia flavor used by the Kubernetes API load balancer.",
  },
  {
    category: "Load balancing",
    key: "api_server_lb_availability_zone",
    label: "API load balancer availability zone",
    defaultValue: "Cloud default",
    description:
      "Octavia availability zone used by the Kubernetes API load balancer.",
  },
  {
    category: "Placement",
    key: "availability_zone",
    label: "Default compute availability zone",
    defaultValue: "Cloud default",
    description: "Default Nova availability zone for cluster machines.",
  },
  {
    category: "Placement",
    key: "control_plane_availability_zones",
    label: "Control plane availability zones",
    defaultValue: "Inherited",
    description:
      "Comma-separated zones used to distribute control-plane machines.",
  },
  {
    category: "Placement",
    key: "different_failure_domain",
    label: "Different failure domains",
    defaultValue: "false",
    description:
      "Uses the VEXXHOST scheduler filter to spread machines across failure domains.",
  },
  {
    category: "Placement",
    key: "server_group_policies",
    label: "Server group policies",
    defaultValue: "soft-anti-affinity",
    description:
      "Nova server group policies applied to control-plane and worker groups.",
  },
  {
    category: "Storage",
    key: "boot_volume_size",
    label: "Boot volume size",
    defaultValue: "Cloud configuration",
    description:
      "Enables boot-from-volume and sets the node root volume size in GiB.",
  },
  {
    category: "Storage",
    key: "boot_volume_type",
    label: "Boot volume type",
    defaultValue: "Cloud default",
    description: "Cinder volume type used for node boot volumes.",
  },
  {
    category: "Storage",
    key: "boot_volume_availability_zone",
    label: "Boot volume availability zone",
    defaultValue: "Compute zone, then cloud default",
    description: "Cinder availability zone used for node boot volumes.",
  },
  {
    category: "Storage",
    key: "docker_volume_type",
    label: "Legacy container volume type",
    defaultValue: "Cloud default",
    description: "Cinder type for Magnum's legacy container data volume.",
  },
  {
    category: "Storage",
    key: "etcd_volume_size",
    label: "etcd volume size",
    defaultValue: "0 (root disk)",
    description:
      "Dedicated etcd volume size in GiB; zero keeps etcd on the root disk.",
  },
  {
    category: "Storage",
    key: "etcd_volume_type",
    label: "etcd volume type",
    defaultValue: "Cloud default",
    description: "Cinder type used for the dedicated etcd data volume.",
  },
  {
    category: "Storage",
    key: "cinder_csi_enabled",
    label: "Cinder CSI",
    defaultValue: "true when Block Storage is available",
    description:
      "Installs the Cinder CSI integration for persistent block volumes.",
  },
  {
    category: "Storage",
    key: "manila_csi_enabled",
    label: "Manila CSI",
    defaultValue: "true when Shared File Systems is available",
    description: "Installs the Manila CSI integration for shared file systems.",
  },
  {
    category: "Storage",
    key: "manila_csi_share_network_id",
    label: "Manila share network",
    defaultValue: "None",
    description:
      "Project-scoped share network selected per cluster to generate Manila-backed StorageClasses.",
  },
  {
    category: "Identity and security",
    key: "keystone_auth_enabled",
    label: "Keystone authentication",
    defaultValue: "true",
    description: "Installs the Kubernetes Keystone authentication webhook.",
  },
  {
    category: "Identity and security",
    key: "api_server_cert_sans",
    label: "Additional API certificate SANs",
    defaultValue: "None",
    description:
      "Comma-separated additional names and addresses in the API certificate.",
  },
  {
    category: "Identity and security",
    key: "api_server_tls_cipher_suites",
    label: "API server TLS cipher suites",
    defaultValue: "Driver secure defaults",
    description:
      "Comma-separated TLS cipher suites accepted by kube-apiserver.",
  },
  {
    category: "Identity and security",
    key: "kubelet_tls_cipher_suites",
    label: "Kubelet TLS cipher suites",
    defaultValue: "Driver secure defaults",
    description: "Comma-separated TLS cipher suites accepted by kubelet.",
  },
  {
    category: "Identity and security",
    key: "audit_log_enabled",
    label: "Kubernetes audit log",
    defaultValue: "false",
    description: "Persists Kubernetes API audit events on control-plane nodes.",
  },
  ...[
    ["audit_log_max_age", "Audit retention", "30 days"],
    ["audit_log_max_backup", "Audit backup files", "10"],
    ["audit_log_max_size", "Audit file size", "100 MiB"],
  ].map(([key, label, defaultValue]) => ({
    category: "Identity and security" as const,
    key,
    label,
    defaultValue,
    description: "Applied when Kubernetes audit logging is enabled.",
  })),
  ...[
    ["oidc_issuer_url", "OIDC issuer URL", "Not configured"],
    ["oidc_client_id", "OIDC client ID", "Not configured"],
    ["oidc_username_claim", "OIDC username claim", "sub"],
    ["oidc_username_prefix", "OIDC username prefix", "-"],
    ["oidc_groups_claim", "OIDC groups claim", "Not configured"],
    ["oidc_groups_prefix", "OIDC groups prefix", "Not configured"],
  ].map(([key, label, defaultValue]) => ({
    category: "Identity and security" as const,
    key,
    label,
    defaultValue,
    description: "OpenID Connect configuration passed to kube-apiserver.",
  })),
  ...[
    ["cilium_tag", "Cilium image", "v1.15.3"],
    ["calico_tag", "Calico image", "v3.32.1"],
    ["cinder_csi_plugin_tag", "Cinder CSI image", "v1.32.0"],
    ["manila_csi_plugin_tag", "Manila CSI image", "v1.32.0"],
    ["csi_attacher_tag", "CSI attacher image", "v4.7.0"],
    ["csi_liveness_probe_tag", "CSI liveness probe image", "v2.14.0"],
    ["csi_node_driver_registrar_tag", "CSI node registrar image", "v2.12.0"],
    ["csi_provisioner_tag", "CSI provisioner image", "v5.1.0"],
    ["csi_resizer_tag", "CSI resizer image", "v1.12.0"],
    ["csi_snapshotter_tag", "CSI snapshotter image", "v8.1.0"],
  ].map(([key, label, defaultValue]) => ({
    category: "Component images" as const,
    key,
    label,
    defaultValue,
    description:
      "Optional image version override; leave unset to follow the driver release.",
  })),
  {
    category: "Component images",
    key: "cloud_provider_tag",
    label: "OpenStack cloud controller",
    defaultValue: "Selected from Kubernetes version",
    description:
      "OpenStack cloud-controller-manager version selected for the Kubernetes release.",
  },
  {
    category: "Component images",
    key: "container_infra_prefix",
    label: "Container image repository",
    defaultValue: "Upstream registries",
    description:
      "Optional registry prefix applied to cluster component images.",
  },
];

export const MAGNUM_DRIVER_LABEL_KEYS = new Set(
  MAGNUM_DRIVER_LABELS.map((label) => label.key),
);

/**
 * Labels read directly from Magnum node groups by magnum-cluster-api.
 * These are separate from cluster-template labels because their defaults and
 * inheritance rules are evaluated per MachineDeployment.
 */
export const MAGNUM_NODE_GROUP_LABELS: MagnumNodeGroupLabelSpec[] = [
  {
    category: "Placement",
    key: "availability_zone",
    label: "Availability zone",
    defaultValue: "Automatic",
    description: "Failure domain used for this worker MachineDeployment.",
  },
  {
    category: "Placement",
    key: "different_failure_domain",
    label: "Different failure domains",
    defaultValue: "Inherited cluster policy",
    description:
      "Enables the VEXXHOST scheduler filter for this node group, otherwise the cluster policy is used.",
  },
  {
    category: "Placement",
    key: "server_group_policies",
    label: "Server group policies",
    defaultValue: "Inherited cluster policy",
    description:
      "Nova server group policies for this worker group, falling back to the cluster policy.",
  },
  {
    category: "Storage",
    key: "boot_volume_size",
    label: "Boot volume size",
    defaultValue: "Cloud configuration",
    description: "Root volume size in GiB for nodes in this group.",
  },
  {
    category: "Storage",
    key: "boot_volume_type",
    label: "Boot volume type",
    defaultValue: "Cloud default",
    description: "Cinder volume type used for nodes in this group.",
  },
  {
    category: "Component images",
    key: "container_infra_prefix",
    label: "Container image repository",
    defaultValue: "Upstream registries",
    description: "Optional image registry prefix for this worker group.",
  },
  {
    category: "Kubernetes",
    key: "max_node_count",
    label: "Autoscaler maximum",
    defaultValue: "Minimum + 1",
    description:
      "Fallback maximum used when the node-group max_node_count field is unset.",
  },
];

const CLOUD_PROVIDER_TAGS: Record<number, string> = {
  22: "v1.22.2",
  23: "v1.23.4",
  24: "v1.24.6",
  25: "v1.25.6",
  26: "v1.26.4",
  27: "v1.27.3",
  28: "v1.28.3",
  29: "v1.29.1",
  30: "v1.30.3",
  31: "v1.31.4",
  32: "v1.32.1",
  33: "v1.33.1",
  34: "v1.34.1",
  35: "v1.35.0",
};

export function magnumCloudProviderTag(kubeTag?: string) {
  const match = kubeTag?.trim().match(/^v?1\.(\d+)\./);
  const minor = match ? Number(match[1]) : Number.NaN;
  return CLOUD_PROVIDER_TAGS[minor] ?? "v1.35.0";
}

export function magnumDriverLabelValue(
  labels: Record<string, string>,
  spec: MagnumDriverLabelSpec,
) {
  const value = labels[spec.key];
  const defaultValue =
    spec.key === "cloud_provider_tag"
      ? magnumCloudProviderTag(labels.kube_tag)
      : spec.defaultValue;
  return {
    explicit: value !== undefined && value !== "",
    value: value !== undefined && value !== "" ? value : defaultValue,
  };
}
