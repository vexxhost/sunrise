"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { FadedText } from "@/components/FadedText";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Cloud,
  Database,
  Gauge,
  Globe2,
  HardDrive,
  KeyRound,
  Layers,
  LockKeyhole,
  Network,
  RefreshCw,
  Route,
  ScrollText,
  Server,
  Shield,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clusterNodeGroupsQueryOptions,
  clusterQueryOptions,
  clusterTemplatesQueryOptions,
} from "@/hooks/queries/useMagnum";
import type {
  MagnumCluster,
  MagnumClusterNodeGroup,
  MagnumClusterTemplate,
} from "@/types/openstack";
import {
  isKubernetesClusterDetailTab,
  type KubernetesClusterDetailTab,
} from "./tabs";

interface ClusterDetailClientProps {
  clusterId: string;
  regionId?: string;
  projectId?: string;
  activeTab: KubernetesClusterDetailTab;
}

interface NodePoolView {
  id: string;
  name: string;
  role: string;
  status?: string;
  statusReason?: string | null;
  nodeCount: number;
  kubernetesVersion?: string;
  flavor?: string;
  image?: string;
  volumeSize?: number;
  synthetic?: boolean;
}

interface EndpointParts {
  href: string;
  protocol: string;
  host: string;
  port: string;
  display: string;
}

interface ComponentSignal {
  area: string;
  component: string;
  value: string;
  detail: string;
  source: string;
}

interface DriverLabelSpec {
  category: string;
  label: string;
  key: string;
  defaultValue: string;
  description: string;
}

const DRIVER_LABELS: DriverLabelSpec[] = [
  {
    category: "Volumes",
    label: "Boot volume size",
    key: "boot_volume_size",
    defaultValue: "Unset",
    description: "Enables boot-from-volume and controls root disk size.",
  },
  {
    category: "Volumes",
    label: "Boot volume type",
    key: "boot_volume_type",
    defaultValue: "Default volume",
    description: "Cinder volume type used for node boot volumes.",
  },
  {
    category: "Volumes",
    label: "Boot volume AZ",
    key: "boot_volume_availability_zone",
    defaultValue: "availability_zone",
    description: "Cinder AZ for node boot volumes.",
  },
  {
    category: "Volumes",
    label: "etcd volume size",
    key: "etcd_volume_size",
    defaultValue: "Unset",
    description: "Dedicated etcd volume size in GB.",
  },
  {
    category: "Volumes",
    label: "etcd volume type",
    key: "etcd_volume_type",
    defaultValue: "None",
    description: "Cinder volume type used by the etcd data volume.",
  },
  {
    category: "Images",
    label: "Container registry prefix",
    key: "container_infra_prefix",
    defaultValue: "Upstream registries",
    description: "Overrides image registry prefix for cluster components.",
  },
  {
    category: "Network",
    label: "Calico IPv4 pool",
    key: "calico_ipv4pool",
    defaultValue: "10.100.0.0/16",
    description: "Pod CIDR allocated by Calico.",
  },
  {
    category: "Network",
    label: "Service CIDR",
    key: "service_cluster_ip_range",
    defaultValue: "10.254.0.0/16",
    description: "Kubernetes service IP range.",
  },
  {
    category: "Auditing",
    label: "Audit logs",
    key: "audit_log_enabled",
    defaultValue: "false",
    description: "Enables Kubernetes API audit logs on control-plane nodes.",
  },
  {
    category: "Auditing",
    label: "Audit retention",
    key: "audit_log_maxage",
    defaultValue: "30",
    description: "Number of days to retain audit logs.",
  },
  {
    category: "Auditing",
    label: "Audit backups",
    key: "audit_log_maxbackup",
    defaultValue: "10",
    description: "Number of rotated audit files to retain.",
  },
  {
    category: "Auditing",
    label: "Audit max size",
    key: "audit_log_maxsize",
    defaultValue: "100",
    description: "Audit log file size in MB before rotation.",
  },
  {
    category: "Cloud Controller",
    label: "Cloud provider image",
    key: "cloud_provider_tag",
    defaultValue: "Detected from kube_tag",
    description: "OpenStack cloud-controller-manager image tag.",
  },
  {
    category: "Cloud Controller",
    label: "Octavia provider",
    key: "octavia_provider",
    defaultValue: "Octavia default",
    description: "Provider for Kubernetes LoadBalancer services.",
  },
  {
    category: "Cloud Controller",
    label: "Octavia algorithm",
    key: "octavia_lb_algorithm",
    defaultValue: "Provider default",
    description: "Load-balancing algorithm for Octavia services.",
  },
  {
    category: "Cloud Controller",
    label: "Octavia healthcheck",
    key: "octavia_lb_healthcheck",
    defaultValue: "true",
    description: "Enables Octavia health monitors for load balancers.",
  },
  {
    category: "CNI",
    label: "Calico image",
    key: "calico_tag",
    defaultValue: "v3.31.3",
    description: "Calico image tag used for cluster networking.",
  },
  {
    category: "CNI",
    label: "Cilium Hubble UI",
    key: "cilium_hubble_ui_enabled",
    defaultValue: "false",
    description: "Deploys Cilium Hubble relay and UI when enabled.",
  },
  {
    category: "CSI",
    label: "Cinder CSI image",
    key: "cinder_csi_plugin_tag",
    defaultValue: "Detected from kube_tag",
    description: "Cinder CSI plugin image tag.",
  },
  {
    category: "CSI",
    label: "Manila CSI image",
    key: "manila_csi_plugin_tag",
    defaultValue: "Detected from kube_tag",
    description: "Manila CSI plugin image tag.",
  },
  {
    category: "CSI",
    label: "Manila share network",
    key: "manila_csi_share_network_id",
    defaultValue: "None",
    description: "Manila share network ID used by Manila CSI.",
  },
  {
    category: "Kubernetes",
    label: "Kubernetes version",
    key: "kube_tag",
    defaultValue: "v1.25.3",
    description: "Kubernetes version used by the cluster.",
  },
  {
    category: "Kubernetes",
    label: "API cert SANs",
    key: "api_server_cert_sans",
    defaultValue: "Unset",
    description: "Extra Kubernetes API server certificate SANs.",
  },
  {
    category: "Kubernetes",
    label: "API TLS ciphers",
    key: "api_server_tls_cipher_suites",
    defaultValue: "Mozilla modern default",
    description: "TLS cipher suites for Kubernetes API server.",
  },
  {
    category: "Kubernetes",
    label: "Kubelet TLS ciphers",
    key: "kubelet_tls_cipher_suites",
    defaultValue: "Driver default",
    description: "TLS cipher suites for kubelet communication.",
  },
  {
    category: "Kubernetes",
    label: "Auto healing",
    key: "auto_healing_enabled",
    defaultValue: "true",
    description: "Replaces failed nodes after unhealthy timeout.",
  },
  {
    category: "Kubernetes",
    label: "Auto scaling",
    key: "auto_scaling_enabled",
    defaultValue: "false",
    description: "Enables Kubernetes Cluster Autoscaler integration.",
  },
  {
    category: "Kubernetes",
    label: "Master LB floating IP",
    key: "master_lb_floating_ip_enabled",
    defaultValue: "true",
    description: "Attaches a floating IP to the Kubernetes API load balancer.",
  },
  {
    category: "OIDC",
    label: "Issuer URL",
    key: "oidc_issuer_url",
    defaultValue: "Unset",
    description: "OIDC issuer used by the Kubernetes API server.",
  },
  {
    category: "OIDC",
    label: "Client ID",
    key: "oidc_client_id",
    defaultValue: "Unset",
    description: "OIDC client ID.",
  },
  {
    category: "OIDC",
    label: "Username claim",
    key: "oidc_username_claim",
    defaultValue: "sub",
    description: "OIDC claim used as Kubernetes username.",
  },
  {
    category: "OIDC",
    label: "Username prefix",
    key: "oidc_username_prefix",
    defaultValue: "-",
    description: "Prefix applied to OIDC usernames.",
  },
  {
    category: "OIDC",
    label: "Groups claim",
    key: "oidc_groups_claim",
    defaultValue: "Unset",
    description: "OIDC claim used for Kubernetes groups.",
  },
  {
    category: "OIDC",
    label: "Groups prefix",
    key: "oidc_groups_prefix",
    defaultValue: "Unset",
    description: "Prefix applied to OIDC groups.",
  },
  {
    category: "OpenStack",
    label: "Fixed subnet CIDR",
    key: "fixed_subnet_cidr",
    defaultValue: "10.0.0.0/24",
    description: "Neutron fixed subnet CIDR for the cluster.",
  },
  {
    category: "OpenStack",
    label: "Different failure domains",
    key: "different_failure_domain",
    defaultValue: "false",
    description: "Spreads nodes across different OpenStack failure domains.",
  },
  {
    category: "OpenStack",
    label: "Server group policies",
    key: "server_group_policies",
    defaultValue: "soft-anti-affinity",
    description: "Nova server group policies per node group.",
  },
  {
    category: "OpenStack",
    label: "Availability zone",
    key: "availability_zone",
    defaultValue: "Unset",
    description: "OpenStack AZ for cluster nodes.",
  },
  {
    category: "OpenStack",
    label: "DNS cluster domain",
    key: "dns_cluster_domain",
    defaultValue: "Unset",
    description: "Kubernetes cluster DNS domain.",
  },
];

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function enabledText(value: unknown, fallback = "-") {
  const rendered = renderBoolean(value);
  return rendered === "-" ? fallback : rendered;
}

function displayStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusVariant(status: string) {
  if (status.endsWith("FAILED")) return "destructive" as const;
  if (status.endsWith("IN_PROGRESS")) return "secondary" as const;
  if (status.endsWith("COMPLETE")) return "default" as const;
  return "outline" as const;
}

function renderBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";

  const normalized = String(value).toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return "Enabled";
  if (["false", "no", "0"].includes(normalized)) return "Disabled";

  return String(value);
}

function renderTls(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return value ? "Disabled" : "Enabled";
}

function renderDriver(value: unknown, fallback = "Default") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function normalizeLabelValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function getLabel(
  labels: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = normalizeLabelValue(labels[key]);
    if (value) return value;
  }

  return undefined;
}

function combinedLabels(
  cluster: MagnumCluster,
  template: MagnumClusterTemplate | undefined,
) {
  return {
    ...(template?.labels ?? {}),
    ...(cluster.labels ?? {}),
  };
}

function getKubernetesMinor(version: string | undefined) {
  const match = version?.match(/^v?(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : "-";
}

function parseEndpoint(value: string | null | undefined): EndpointParts | null {
  if (!value) return null;

  try {
    const endpoint = new URL(value);
    return {
      href: value,
      protocol: endpoint.protocol.replace(":", "").toUpperCase(),
      host: endpoint.hostname,
      port: endpoint.port || "-",
      display: `${endpoint.hostname}${endpoint.port ? `:${endpoint.port}` : ""}`,
    };
  } catch {
    return {
      href: value,
      protocol: "-",
      host: value,
      port: "-",
      display: value,
    };
  }
}

function joinOrDash(values: Array<string | undefined>) {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.join(", ") : "-";
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function getNodeGroupRole(nodegroup: MagnumClusterNodeGroup) {
  if (nodegroup.roles?.length) return nodegroup.roles.join(", ");
  return nodegroup.role || "-";
}

function buildNodePools(
  cluster: MagnumCluster,
  template: MagnumClusterTemplate | undefined,
  nodegroups: MagnumClusterNodeGroup[],
): NodePoolView[] {
  if (nodegroups.length > 0) {
    return nodegroups.map((nodegroup) => ({
      id: nodegroup.uuid,
      name: nodegroup.name,
      role: getNodeGroupRole(nodegroup),
      status: nodegroup.status,
      statusReason: nodegroup.status_reason,
      nodeCount: nodegroup.node_count ?? 0,
      kubernetesVersion:
        nodegroup.labels?.kube_tag?.replace(/^v/, "") ??
        cluster.coe_version?.replace(/^v/, ""),
      flavor: nodegroup.flavor_id,
      image: nodegroup.image_id,
      volumeSize: nodegroup.docker_volume_size,
    }));
  }

  return [
    {
      id: "default-master",
      name: "default-master",
      role: "master",
      status: cluster.status,
      nodeCount: cluster.master_count ?? 0,
      kubernetesVersion: cluster.coe_version?.replace(/^v/, ""),
      flavor: template?.master_flavor_id,
      image: template?.image_id,
      volumeSize: template?.docker_volume_size,
      synthetic: true,
    },
    {
      id: "default-worker",
      name: "default-worker",
      role: "worker",
      status: cluster.status,
      nodeCount: cluster.node_count ?? 0,
      kubernetesVersion: cluster.coe_version?.replace(/^v/, ""),
      flavor: template?.flavor_id,
      image: template?.image_id,
      volumeSize: template?.docker_volume_size,
      synthetic: true,
    },
  ];
}

function buildComponentSignals(
  cluster: MagnumCluster,
  template: MagnumClusterTemplate | undefined,
): ComponentSignal[] {
  const labels = combinedLabels(cluster, template);
  const cniTag = getLabel(labels, [
    "cilium_tag",
    "calico_tag",
    "flannel_tag",
    "flannel_version",
  ]);
  const cloudProviderTag = getLabel(labels, [
    "cloud_provider_tag",
    "openstack_cloud_provider_tag",
  ]);
  const kubeTag = getLabel(labels, ["kube_tag", "kube_version"]);
  const cinderCsiTag = getLabel(labels, [
    "cinder_csi_plugin_tag",
    "cinder_csi_attacher_tag",
  ]);
  const keystoneTag = getLabel(labels, [
    "k8s_keystone_auth_tag",
    "keystone_auth_tag",
  ]);
  const octaviaTag = getLabel(labels, [
    "octavia_ingress_controller_tag",
    "octavia_provider",
  ]);
  const autoHealing = getLabel(labels, [
    "auto_healing_enabled",
    "auto_healing_controller",
  ]);
  const autoScaling = getLabel(labels, ["auto_scaling_enabled"]);
  const auditLogs = getLabel(labels, ["audit_log_enabled"]);
  const serviceCidr = getLabel(labels, ["service_cluster_ip_range"]);
  const podCidr = getLabel(labels, ["calico_ipv4pool"]);
  const oidcIssuer = getLabel(labels, ["oidc_issuer_url"]);
  const failureDomains = getLabel(labels, [
    "different_failure_domain",
    "server_group_policies",
  ]);

  return [
    {
      area: "Control plane",
      component: "Kubernetes API",
      value: cluster.coe_version || kubeTag || "-",
      detail: `minor ${getKubernetesMinor(cluster.coe_version || kubeTag)}`,
      source: cluster.coe_version ? "cluster.coe_version" : "labels.kube_tag",
    },
    {
      area: "Networking",
      component: "Pod networking",
      value: renderDriver(template?.network_driver),
      detail: joinOrDash([cniTag, podCidr]),
      source: "template.network_driver",
    },
    {
      area: "Networking",
      component: "Service network",
      value: serviceCidr || "10.254.0.0/16",
      detail: serviceCidr ? "configured label" : "driver default",
      source: "labels.service_cluster_ip_range",
    },
    {
      area: "Networking",
      component: "Cloud provider",
      value: enabledText(getLabel(labels, ["cloud_provider_enabled"])),
      detail: cloudProviderTag || "-",
      source: "template labels",
    },
    {
      area: "Load balancing",
      component: "API load balancer",
      value: enabledText(template?.master_lb_enabled),
      detail: `floating IP ${renderBoolean(cluster.floating_ip_enabled).toLowerCase()}`,
      source: "template.master_lb_enabled",
    },
    {
      area: "Load balancing",
      component: "Ingress controller",
      value: octaviaTag ? "Configured" : "-",
      detail: octaviaTag || "-",
      source: "template labels",
    },
    {
      area: "Storage",
      component: "Volume integration",
      value: renderDriver(template?.volume_driver, "No volume driver"),
      detail:
        joinOrDash([
          cinderCsiTag,
          getLabel(labels, ["manila_csi_plugin_tag"]),
        ]) || "template volume driver",
      source: "template.volume_driver",
    },
    {
      area: "Storage",
      component: "Node image volume",
      value: template?.docker_volume_size
        ? `${template.docker_volume_size} GB`
        : "Local image storage",
      detail: template?.docker_storage_driver || "-",
      source: "template.docker_volume_size",
    },
    {
      area: "Authority",
      component: "TLS",
      value: renderTls(template?.tls_disabled),
      detail: template?.insecure_registry
        ? `insecure registry ${template.insecure_registry}`
        : "API TLS setting",
      source: "template.tls_disabled",
    },
    {
      area: "Authority",
      component: "Keystone authentication",
      value: keystoneTag ? "Configured" : "-",
      detail: keystoneTag || "-",
      source: "template labels",
    },
    {
      area: "Authority",
      component: "OIDC",
      value: oidcIssuer ? "Configured" : "-",
      detail: oidcIssuer || "-",
      source: "labels.oidc_issuer_url",
    },
    {
      area: "Security",
      component: "API auditing",
      value: enabledText(auditLogs, "Disabled"),
      detail: joinOrDash([
        getLabel(labels, ["audit_log_maxage"]),
        getLabel(labels, ["audit_log_maxsize"]),
      ]),
      source: "labels.audit_log_enabled",
    },
    {
      area: "Operations",
      component: "Auto healing",
      value: enabledText(autoHealing),
      detail:
        getLabel(labels, ["auto_healing_controller", "auto_scaling_enabled"]) ||
        "-",
      source: "template labels",
    },
    {
      area: "Operations",
      component: "Auto scaling",
      value: enabledText(autoScaling, "Disabled"),
      detail: "Kubernetes Cluster Autoscaler",
      source: "labels.auto_scaling_enabled",
    },
    {
      area: "Placement",
      component: "Failure domains",
      value: enabledText(failureDomains, "Default scheduling"),
      detail: getLabel(labels, ["availability_zone"]) || "-",
      source: "labels.different_failure_domain",
    },
  ];
}

function TemplateLink({
  template,
  templateId,
}: {
  template?: MagnumClusterTemplate;
  templateId: string;
}) {
  if (!template) {
    return <span className="font-mono text-xs">{templateId}</span>;
  }

  return (
    <span>
      {template.name}{" "}
      <span className="font-mono text-xs text-muted-foreground">
        ({template.uuid})
      </span>
    </span>
  );
}

function LabelsList({
  labels,
  emptyLabel = "Labels",
}: {
  labels?: Record<string, string>;
  emptyLabel?: string;
}) {
  const entries = Object.entries(labels ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (entries.length === 0) {
    return <DetailField label={emptyLabel}>-</DetailField>;
  }

  return entries.map(([key, value]) => (
    <DetailField key={key} label={key} className="font-mono text-xs">
      {value}
    </DetailField>
  ));
}

function NodeGroupLabelsList({
  nodegroups,
}: {
  nodegroups: MagnumClusterNodeGroup[];
}) {
  const entries = nodegroups.flatMap((nodegroup) =>
    Object.entries(nodegroup.labels ?? {}).map(([key, value]) => ({
      key: `${nodegroup.uuid}-${key}`,
      label: `${nodegroup.name}.${key}`,
      value,
    })),
  );

  if (entries.length === 0) {
    return <DetailField label="Node Group Labels">-</DetailField>;
  }

  return entries.map((entry) => (
    <DetailField
      key={entry.key}
      label={entry.label}
      className="font-mono text-xs"
    >
      {entry.value}
    </DetailField>
  ));
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="mt-3 min-w-0 truncate text-lg font-semibold">{value}</div>
      {detail ? (
        <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function CapabilityTile({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 truncate">{title}</span>
      </div>
      <div className="mt-2 min-w-0 truncate text-sm">{value}</div>
      <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

function NodePoolsTable({ nodePools }: { nodePools: NodePoolView[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Node group</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Nodes</TableHead>
            <TableHead>Kubernetes Version</TableHead>
            <TableHead>Image ID</TableHead>
            <TableHead>Flavor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodePools.map((pool) => (
            <TableRow key={pool.id}>
              <TableCell className="whitespace-normal">
                <div className="min-w-0">
                  <div className="font-medium">{pool.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {pool.synthetic ? "derived from cluster counts" : pool.id}
                  </div>
                </div>
              </TableCell>
              <TableCell>{pool.role}</TableCell>
              <TableCell>
                {pool.status ? (
                  <div className="flex min-w-0 flex-col gap-1">
                    <Badge
                      className="w-fit"
                      variant={statusVariant(pool.status)}
                    >
                      {displayStatus(pool.status)}
                    </Badge>
                    {pool.statusReason ? (
                      <span className="max-w-56 truncate text-xs text-muted-foreground">
                        {pool.statusReason}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>{pool.nodeCount}</TableCell>
              <TableCell>{emptyToDash(pool.kubernetesVersion)}</TableCell>
              <TableCell className="max-w-72 whitespace-normal font-mono text-xs [overflow-wrap:anywhere]">
                {emptyToDash(pool.image)}
              </TableCell>
              <TableCell>{emptyToDash(pool.flavor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ComponentSignalsTable({ signals }: { signals: ComponentSignal[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Area</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((signal) => (
            <TableRow key={`${signal.area}-${signal.component}`}>
              <TableCell>{signal.area}</TableCell>
              <TableCell>{signal.component}</TableCell>
              <TableCell className="whitespace-normal">
                {signal.value}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal text-muted-foreground [overflow-wrap:anywhere]">
                {signal.detail}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {signal.source}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DriverLabelsTable({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Category</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Meaning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DRIVER_LABELS.map((spec) => {
            const value = labels[spec.key];

            return (
              <TableRow key={spec.key}>
                <TableCell>{spec.category}</TableCell>
                <TableCell>
                  <FadedText
                    value={spec.key}
                    className="w-56 font-mono text-xs"
                  />
                </TableCell>
                <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                  {value ? (
                    <span>{value}</span>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground [overflow-wrap:anywhere]">
                  {spec.defaultValue}
                </TableCell>
                <TableCell className="max-w-96 whitespace-normal text-muted-foreground">
                  {spec.description}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ClusterDetailClient({
  clusterId,
  regionId,
  projectId,
  activeTab,
}: ClusterDetailClientProps) {
  const clusterQuery = clusterQueryOptions(regionId, projectId, clusterId);
  const nodeGroupsQuery = clusterNodeGroupsQueryOptions(
    regionId,
    projectId,
    clusterId,
  );
  const templatesQuery = clusterTemplatesQueryOptions(regionId, projectId);
  const {
    data: cluster,
    isRefetching: isClusterRefetching,
    refetch: refetchCluster,
  } = useSuspenseQuery(clusterQuery);
  const {
    data: nodegroups,
    isRefetching: isNodeGroupsRefetching,
    refetch: refetchNodeGroups,
  } = useSuspenseQuery(nodeGroupsQuery);
  const {
    data: templates,
    isRefetching: isTemplatesRefetching,
    refetch: refetchTemplates,
  } = useSuspenseQuery(templatesQuery);

  const template = useMemo(() => {
    return (
      cluster.cluster_template ??
      templates.find(
        (candidate: MagnumClusterTemplate) =>
          candidate.uuid === cluster.cluster_template_id,
      )
    );
  }, [cluster.cluster_template, cluster.cluster_template_id, templates]);

  const nodePools = useMemo(
    () => buildNodePools(cluster, template, nodegroups),
    [cluster, nodegroups, template],
  );
  const totalNodes = nodePools.reduce((sum, pool) => sum + pool.nodeCount, 0);
  const workerNodes =
    nodePools
      .filter((pool) => pool.role.toLowerCase().includes("worker"))
      .reduce((sum, pool) => sum + pool.nodeCount, 0) ||
    cluster.node_count ||
    0;
  const controlNodes =
    nodePools
      .filter((pool) => pool.role.toLowerCase().includes("master"))
      .reduce((sum, pool) => sum + pool.nodeCount, 0) ||
    cluster.master_count ||
    0;
  const labels = combinedLabels(cluster, template);
  const componentSignals = useMemo(
    () => buildComponentSignals(cluster, template),
    [cluster, template],
  );
  const apiEndpoint = parseEndpoint(cluster.api_address);
  const kubernetesMinor = getKubernetesMinor(cluster.coe_version);
  const nodePoolFlavors = uniqueValues(nodePools.map((pool) => pool.flavor));
  const authorityProjectId = cluster.project_id ?? template?.project_id;
  const authorityUserId = cluster.user_id ?? template?.user_id;
  const configuredDriverLabels = DRIVER_LABELS.filter(
    (spec) => labels[spec.key],
  );
  const configuredDriverCategories = uniqueValues(
    configuredDriverLabels.map((spec) => spec.category),
  );
  const isRefreshing =
    isClusterRefetching || isNodeGroupsRefetching || isTemplatesRefetching;
  const [selectedTab, setSelectedTab] =
    useState<KubernetesClusterDetailTab>(activeTab);

  useEffect(() => {
    setSelectedTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const tab = segments[segments.length - 1];

      if (tab && isKubernetesClusterDetailTab(tab)) {
        setSelectedTab(tab);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleTabChange = (value: string) => {
    if (!isKubernetesClusterDetailTab(value)) {
      return;
    }

    setSelectedTab(value);
    const nextPath = `/kubernetes/clusters/${clusterId}/${value}`;

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  };

  const handleRefresh = () => {
    void Promise.all([
      refetchCluster(),
      refetchNodeGroups(),
      refetchTemplates(),
    ]);
  };

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
              {cluster.name || "Unnamed cluster"}
            </h1>
            <Badge variant={statusVariant(cluster.status)}>
              {displayStatus(cluster.status)}
            </Badge>
            {cluster.health_status ? (
              <Badge
                variant={
                  cluster.health_status === "HEALTHY"
                    ? "default"
                    : "destructive"
                }
              >
                {displayStatus(cluster.health_status)}
              </Badge>
            ) : null}
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {cluster.uuid}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-9 gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryTile
          icon={Activity}
          label="Cluster state"
          value={displayStatus(cluster.status)}
          detail={cluster.status_reason || "Magnum lifecycle status"}
        />
        <SummaryTile
          icon={CheckCircle2}
          label="Health"
          value={
            cluster.health_status ? displayStatus(cluster.health_status) : "-"
          }
          detail="Magnum health"
        />
        <SummaryTile
          icon={Gauge}
          label="Kubernetes version"
          value={kubernetesMinor}
          detail="coe_version"
        />
        <SummaryTile
          icon={Boxes}
          label="Node groups"
          value={String(nodePools.length)}
          detail={`${controlNodes} control / ${workerNodes} worker`}
        />
        <SummaryTile
          icon={Cloud}
          label="API endpoint"
          value={apiEndpoint?.display ?? "-"}
          detail={apiEndpoint?.protocol ?? "No API address reported"}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CapabilityTile
          icon={Server}
          title="Compute"
          value={`${emptyToDash(template?.server_type || "vm").toUpperCase()} node servers`}
          detail={`${emptyToDash(template?.master_flavor_id)} control, ${emptyToDash(template?.flavor_id)} worker`}
        />
        <CapabilityTile
          icon={Network}
          title="Networking"
          value={`${renderDriver(template?.network_driver)} pod networking`}
          detail={`Floating IP ${renderBoolean(cluster.floating_ip_enabled).toLowerCase()}`}
        />
        <CapabilityTile
          icon={Database}
          title="Storage"
          value={renderDriver(template?.volume_driver, "No volume driver")}
          detail={
            template?.docker_volume_size
              ? `${template.docker_volume_size} GB image volume per node`
              : "Local image storage"
          }
        />
        <CapabilityTile
          icon={ShieldCheck}
          title="Key pair"
          value={emptyToDash(cluster.keypair ?? template?.keypair_id)}
          detail="SSH access"
        />
        <CapabilityTile
          icon={Wrench}
          title="Operations"
          value={`Healing ${enabledText(getLabel(labels, ["auto_healing_enabled"]), "Enabled").toLowerCase()}`}
          detail={`Scaling ${enabledText(getLabel(labels, ["auto_scaling_enabled"]), "Disabled").toLowerCase()}`}
        />
        <CapabilityTile
          icon={ScrollText}
          title="Driver labels"
          value={`${configuredDriverLabels.length} configured`}
          detail={joinOrDash(configuredDriverCategories)}
        />
      </div>

      <Tabs
        value={selectedTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 md:w-fit md:grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="node-groups">Node groups</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="networking">Networking</TabsTrigger>
          <TabsTrigger value="authority">Authority</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Cluster">
              <DetailField label="Name">
                {emptyToDash(cluster.name)}
              </DetailField>
              <DetailField label="ID" className="font-mono text-xs">
                {cluster.uuid}
              </DetailField>
              <DetailField label="Status">
                <div className="flex min-w-0 flex-col gap-1">
                  <Badge
                    className="w-fit"
                    variant={statusVariant(cluster.status)}
                  >
                    {displayStatus(cluster.status)}
                  </Badge>
                  {cluster.status_reason ? (
                    <span className="text-xs text-muted-foreground">
                      {cluster.status_reason}
                    </span>
                  ) : null}
                </div>
              </DetailField>
              <DetailField label="Health">
                {cluster.health_status ? (
                  <Badge
                    variant={
                      cluster.health_status === "HEALTHY"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {displayStatus(cluster.health_status)}
                  </Badge>
                ) : (
                  "-"
                )}
              </DetailField>
              <DetailField label="Template">
                <TemplateLink
                  template={template}
                  templateId={cluster.cluster_template_id}
                />
              </DetailField>
              <DetailField label="Stack ID" className="font-mono text-xs">
                {emptyToDash(cluster.stack_id)}
              </DetailField>
            </DetailSection>

            <DetailSection title="Kubernetes">
              <DetailField label="Kubernetes Version">
                {kubernetesMinor}
              </DetailField>
              <DetailField label="Control Nodes">{controlNodes}</DetailField>
              <DetailField label="Worker Nodes">{workerNodes}</DetailField>
              <DetailField label="Key Pair">
                {emptyToDash(cluster.keypair)}
              </DetailField>
            </DetailSection>
          </div>

          <DetailSection title="Stats">
            <DetailField label="Total Nodes">
              {totalNodes || controlNodes + workerNodes}
            </DetailField>
            <DetailField label="Node Groups">{nodePools.length}</DetailField>
            <DetailField label="Flavors">
              {joinOrDash(nodePoolFlavors)}
            </DetailField>
            <DetailField label="Create Timeout">
              {cluster.create_timeout
                ? `${cluster.create_timeout} minutes`
                : "-"}
            </DetailField>
          </DetailSection>

          <DetailSection title="Timestamps">
            <DetailField label="Created">
              {emptyToDash(cluster.created_at)}
            </DetailField>
            <DetailField label="Updated">
              {emptyToDash(cluster.updated_at)}
            </DetailField>
            <DetailField label="Stack Created">
              {emptyToDash(cluster.stack_created_at)}
            </DetailField>
            <DetailField label="Stack Updated">
              {emptyToDash(cluster.stack_updated_at)}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent value="node-groups" className="space-y-4">
          <section className="space-y-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">Node groups</h2>
              <p className="text-sm text-muted-foreground">
                Magnum nodegroups separate control and worker capacity, and can
                carry placement labels for availability zones or workload roles.
              </p>
            </div>
            <NodePoolsTable nodePools={nodePools} />
          </section>
        </TabsContent>

        <TabsContent value="components" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <CapabilityTile
              icon={Gauge}
              title="Kubernetes"
              value={kubernetesMinor}
              detail="coe_version"
            />
            <CapabilityTile
              icon={Route}
              title="Pod network"
              value={renderDriver(template?.network_driver)}
              detail={
                getLabel(labels, ["cilium_tag", "calico_tag", "flannel_tag"]) ||
                "-"
              }
            />
            <CapabilityTile
              icon={HardDrive}
              title="Storage driver"
              value={renderDriver(template?.volume_driver, "No volume driver")}
              detail={
                getLabel(labels, [
                  "cinder_csi_plugin_tag",
                  "cinder_csi_attacher_tag",
                ]) || "-"
              }
            />
            <CapabilityTile
              icon={Activity}
              title="Auto scaling"
              value={enabledText(
                getLabel(labels, ["auto_scaling_enabled"]),
                "Disabled",
              )}
              detail="Cluster Autoscaler integration"
            />
            <CapabilityTile
              icon={CheckCircle2}
              title="Auto healing"
              value={enabledText(
                getLabel(labels, ["auto_healing_enabled"]),
                "Enabled",
              )}
              detail="Node remediation through Cluster API"
            />
            <CapabilityTile
              icon={ScrollText}
              title="Audit logs"
              value={enabledText(
                getLabel(labels, ["audit_log_enabled"]),
                "Disabled",
              )}
              detail={`retention ${getLabel(labels, ["audit_log_maxage"]) || "30"} days`}
            />
            <CapabilityTile
              icon={Globe2}
              title="Service CIDR"
              value={
                getLabel(labels, ["service_cluster_ip_range"]) ||
                "10.254.0.0/16"
              }
              detail={`pod CIDR ${getLabel(labels, ["calico_ipv4pool"]) || "10.100.0.0/16"}`}
            />
            <CapabilityTile
              icon={Cloud}
              title="Cloud provider"
              value={enabledText(getLabel(labels, ["cloud_provider_enabled"]))}
              detail={
                getLabel(labels, [
                  "cloud_provider_tag",
                  "openstack_cloud_provider_tag",
                ]) || "-"
              }
            />
            <CapabilityTile
              icon={ShieldCheck}
              title="Keystone auth"
              value={
                getLabel(labels, ["k8s_keystone_auth_tag", "keystone_auth_tag"])
                  ? "Configured"
                  : "-"
              }
              detail={
                getLabel(labels, [
                  "k8s_keystone_auth_tag",
                  "keystone_auth_tag",
                ]) || "-"
              }
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Component Signals</h2>
            <ComponentSignalsTable signals={componentSignals} />
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Driver Configuration</h2>
              <p className="text-sm text-muted-foreground">
                These labels are specific to the VEXXHOST Cluster API driver for
                Magnum. Missing values are shown with their documented defaults
                where the driver provides one.
              </p>
            </div>
            <DriverLabelsTable labels={labels} />
          </section>
        </TabsContent>

        <TabsContent value="networking" className="space-y-4">
          <DetailSection title="Access And Networking">
            <DetailField label="API Address">
              {apiEndpoint ? (
                <a
                  href={apiEndpoint.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {apiEndpoint.href}
                </a>
              ) : (
                "-"
              )}
            </DetailField>
            <DetailField label="Fixed Network">
              {emptyToDash(cluster.fixed_network)}
            </DetailField>
            <DetailField label="Fixed Subnet">
              {emptyToDash(cluster.fixed_subnet)}
            </DetailField>
            <DetailField label="Fixed Subnet CIDR">
              {getLabel(labels, ["fixed_subnet_cidr"]) || "10.0.0.0/24"}
            </DetailField>
            <DetailField label="Floating IP">
              {renderBoolean(cluster.floating_ip_enabled)}
            </DetailField>
            <DetailField label="Master LB Floating IP">
              {getLabel(labels, ["master_lb_floating_ip_enabled"]) || "true"}
            </DetailField>
            <DetailField label="Network Driver">
              {emptyToDash(template?.network_driver)}
            </DetailField>
            <DetailField label="Pod CIDR">
              {getLabel(labels, ["calico_ipv4pool"]) || "10.100.0.0/16"}
            </DetailField>
            <DetailField label="Service CIDR">
              {getLabel(labels, ["service_cluster_ip_range"]) ||
                "10.254.0.0/16"}
            </DetailField>
            <DetailField label="Octavia Provider">
              {emptyToDash(getLabel(labels, ["octavia_provider"]))}
            </DetailField>
            <DetailField label="Octavia Algorithm">
              {emptyToDash(getLabel(labels, ["octavia_lb_algorithm"]))}
            </DetailField>
            <DetailField label="Octavia Healthcheck">
              {getLabel(labels, ["octavia_lb_healthcheck"]) || "true"}
            </DetailField>
            <DetailField label="External Network" className="font-mono text-xs">
              {emptyToDash(template?.external_network_id)}
            </DetailField>
            <DetailField label="DNS Nameserver">
              {emptyToDash(template?.dns_nameserver)}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent value="authority" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Authority">
              <DetailField label="TLS">
                {renderTls(template?.tls_disabled)}
              </DetailField>
              <DetailField label="API Authority">
                {emptyToDash(apiEndpoint?.display)}
              </DetailField>
              <DetailField label="Certificate Authority">-</DetailField>
              <DetailField label="API Cert SANs">
                {emptyToDash(getLabel(labels, ["api_server_cert_sans"]))}
              </DetailField>
              <DetailField
                label="API TLS Ciphers"
                className="font-mono text-xs"
              >
                {emptyToDash(
                  getLabel(labels, ["api_server_tls_cipher_suites"]),
                )}
              </DetailField>
              <DetailField
                label="Kubelet TLS Ciphers"
                className="font-mono text-xs"
              >
                {emptyToDash(getLabel(labels, ["kubelet_tls_cipher_suites"]))}
              </DetailField>
              <DetailField label="Keystone Authentication">
                {getLabel(labels, [
                  "k8s_keystone_auth_tag",
                  "keystone_auth_tag",
                ])
                  ? "Configured"
                  : "-"}
              </DetailField>
              <DetailField label="Keystone Auth Image">
                {emptyToDash(
                  getLabel(labels, [
                    "k8s_keystone_auth_tag",
                    "keystone_auth_tag",
                  ]),
                )}
              </DetailField>
              <DetailField label="Key Pair">
                {emptyToDash(cluster.keypair ?? template?.keypair_id)}
              </DetailField>
            </DetailSection>

            <DetailSection title="OIDC">
              <DetailField label="Issuer URL">
                {emptyToDash(getLabel(labels, ["oidc_issuer_url"]))}
              </DetailField>
              <DetailField label="Client ID">
                {emptyToDash(getLabel(labels, ["oidc_client_id"]))}
              </DetailField>
              <DetailField label="Username Claim">
                {getLabel(labels, ["oidc_username_claim"]) || "sub"}
              </DetailField>
              <DetailField label="Username Prefix">
                {getLabel(labels, ["oidc_username_prefix"]) || "-"}
              </DetailField>
              <DetailField label="Groups Claim">
                {emptyToDash(getLabel(labels, ["oidc_groups_claim"]))}
              </DetailField>
              <DetailField label="Groups Prefix">
                {emptyToDash(getLabel(labels, ["oidc_groups_prefix"]))}
              </DetailField>
            </DetailSection>

            <DetailSection title="Ownership">
              <DetailField label="Project ID" className="font-mono text-xs">
                {emptyToDash(authorityProjectId)}
              </DetailField>
              <DetailField label="User ID" className="font-mono text-xs">
                {emptyToDash(authorityUserId)}
              </DetailField>
              <DetailField label="Template Owner" className="font-mono text-xs">
                {emptyToDash(template?.owner)}
              </DetailField>
              <DetailField label="Template Visibility">
                {template?.public === undefined
                  ? "-"
                  : template.public
                    ? "Public"
                    : "Private"}
              </DetailField>
              <DetailField label="Template Hidden">
                {renderBoolean(template?.hidden)}
              </DetailField>
              <DetailField label="Registry">
                {renderBoolean(template?.registry_enabled)}
              </DetailField>
              <DetailField label="Insecure Registry">
                {emptyToDash(template?.insecure_registry)}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent value="template" className="space-y-4">
          <DetailSection title="Template">
            <DetailField label="Name">
              {emptyToDash(template?.name)}
            </DetailField>
            <DetailField label="Image" className="font-mono text-xs">
              {emptyToDash(template?.image_id)}
            </DetailField>
            <DetailField label="Server Type">
              {emptyToDash(template?.server_type)}
            </DetailField>
            <DetailField label="Worker Flavor">
              {emptyToDash(template?.flavor_id)}
            </DetailField>
            <DetailField label="Control Flavor">
              {emptyToDash(template?.master_flavor_id)}
            </DetailField>
            <DetailField label="Network Driver">
              {emptyToDash(template?.network_driver)}
            </DetailField>
            <DetailField label="Volume Driver">
              {emptyToDash(template?.volume_driver)}
            </DetailField>
            <DetailField label="Boot Volume Size">
              {emptyToDash(getLabel(labels, ["boot_volume_size"]))}
            </DetailField>
            <DetailField label="Boot Volume Type">
              {emptyToDash(getLabel(labels, ["boot_volume_type"]))}
            </DetailField>
            <DetailField label="Boot Volume AZ">
              {emptyToDash(getLabel(labels, ["boot_volume_availability_zone"]))}
            </DetailField>
            <DetailField label="etcd Volume Size">
              {emptyToDash(getLabel(labels, ["etcd_volume_size"]))}
            </DetailField>
            <DetailField label="etcd Volume Type">
              {emptyToDash(getLabel(labels, ["etcd_volume_type"]))}
            </DetailField>
            <DetailField label="Container Registry Prefix">
              {emptyToDash(getLabel(labels, ["container_infra_prefix"]))}
            </DetailField>
            <DetailField label="External Network" className="font-mono text-xs">
              {emptyToDash(template?.external_network_id)}
            </DetailField>
            <DetailField label="API Server Port">
              {emptyToDash(template?.apiserver_port)}
            </DetailField>
            <DetailField label="Control Plane Load Balancer">
              {renderBoolean(template?.master_lb_enabled)}
            </DetailField>
            <DetailField label="DNS Nameserver">
              {emptyToDash(template?.dns_nameserver)}
            </DetailField>
            <DetailField label="TLS">
              {renderTls(template?.tls_disabled)}
            </DetailField>
            <DetailField label="HTTP Proxy">
              {emptyToDash(template?.http_proxy)}
            </DetailField>
            <DetailField label="HTTPS Proxy">
              {emptyToDash(template?.https_proxy)}
            </DetailField>
            <DetailField label="No Proxy">
              {emptyToDash(template?.no_proxy)}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Cluster Labels">
              <LabelsList labels={cluster.labels} />
            </DetailSection>
            <DetailSection title="Template Labels">
              <LabelsList
                labels={template?.labels}
                emptyLabel="Template Labels"
              />
            </DetailSection>
            <DetailSection title="Node Group Labels">
              <NodeGroupLabelsList nodegroups={nodegroups} />
            </DetailSection>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        <span>
          Node group Kubernetes versions use each Magnum nodegroup
          <span className="font-mono"> kube_tag </span>
          label when available.
        </span>
      </div>
    </div>
  );
}
