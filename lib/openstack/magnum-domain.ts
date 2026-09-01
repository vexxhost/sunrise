import { imageOperatingSystemMetadata } from "@/lib/openstack/image-metadata";
import type {
  Image,
  MagnumCluster,
  MagnumClusterNodeGroup,
  Server,
} from "@/types/openstack";

export const KUBERNETES_VERSION_PATTERN =
  /^\d+\.\d+\.\d+$/;

export function normalizeKubernetesVersion(value?: string | null) {
  const version = value?.trim();
  if (!version) return "-";
  return version.replace(/^v(?=\d)/i, "");
}

export function kubernetesVersionTag(value: string) {
  const version = value.trim();
  return version.startsWith("v") ? version : `v${version}`;
}

export function magnumImageDistribution(image: Image | undefined) {
  const metadata = imageOperatingSystemMetadata(image);
  return metadata?.source === "os_distro" ? metadata.label : undefined;
}

export function isMagnumCompatibleImage(image: Image) {
  return Boolean(magnumImageDistribution(image));
}

export function clusterKubernetesVersion(cluster: MagnumCluster) {
  return normalizeKubernetesVersion(
    cluster.coe_version ??
      cluster.labels?.kube_tag ??
      cluster.cluster_template?.labels?.kube_tag,
  );
}

export type KubernetesHealthIssue = {
  id: string;
  resource: string;
  resourceType: "API server" | "Machine" | "Cluster";
  state: string;
  summary: string;
};

export type KubernetesHealthDiagnostics = {
  apiReady: boolean | null;
  issues: KubernetesHealthIssue[];
  machineCount: number;
  readyMachineCount: number;
  raw: Record<string, string>;
};

function normalizedHealthValue(value: string) {
  return value.trim().toLowerCase();
}

function machineNameFromHealthKey(key: string) {
  return key.replace(/\.Ready$/i, "");
}

export function getKubernetesHealthDiagnostics(
  cluster: Pick<MagnumCluster, "health_status" | "health_status_reason">,
): KubernetesHealthDiagnostics {
  const raw = cluster.health_status_reason ?? {};
  const issues: KubernetesHealthIssue[] = [];
  let apiReady: boolean | null = null;
  let machineCount = 0;
  let readyMachineCount = 0;

  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizedHealthValue(value);

    if (key.toLowerCase() === "api") {
      apiReady = normalized === "ok" || normalized === "true";
      if (!apiReady) {
        issues.push({
          id: key,
          resource: "Kubernetes API",
          resourceType: "API server",
          state: value,
          summary: "The Kubernetes control-plane endpoint is not ready.",
        });
      }
      continue;
    }

    if (/\.Ready$/i.test(key)) {
      machineCount += 1;
      const ready = normalized === "true" || normalized === "ready";
      if (ready) {
        readyMachineCount += 1;
      } else {
        issues.push({
          id: key,
          resource: machineNameFromHealthKey(key),
          resourceType: "Machine",
          state: value,
          summary: "Cluster API reports that this machine is not ready.",
        });
      }
      continue;
    }

    if (!["true", "ready", "ok", "healthy"].includes(normalized)) {
      issues.push({
        id: key,
        resource: key,
        resourceType: "Cluster",
        state: value,
        summary: "Magnum reports an unhealthy cluster check.",
      });
    }
  }

  if (
    issues.length === 0 &&
    cluster.health_status?.toUpperCase() === "UNHEALTHY"
  ) {
    issues.push({
      id: "cluster-health",
      resource: "Cluster",
      resourceType: "Cluster",
      state: cluster.health_status,
      summary:
        "Magnum reports this cluster as unhealthy without check details.",
    });
  }

  return {
    apiReady,
    issues,
    machineCount,
    readyMachineCount,
    raw,
  };
}

export function kubernetesHealthSummary(cluster: MagnumCluster) {
  const diagnostics = getKubernetesHealthDiagnostics(cluster);
  const first = diagnostics.issues[0];

  if (first) {
    return first.resourceType === "Machine"
      ? `${first.resource} is not ready`
      : first.summary;
  }

  if (diagnostics.machineCount > 0) {
    return `${diagnostics.readyMachineCount} of ${diagnostics.machineCount} machines ready`;
  }

  return cluster.health_status
    ? `Magnum reports ${cluster.health_status.toLowerCase()}`
    : "Cluster health has not been reported";
}

function normalizedAddress(value: string) {
  return value.trim().toLowerCase();
}

export function serversForNodeGroup(
  nodeGroup: Pick<MagnumClusterNodeGroup, "name" | "node_addresses" | "role">,
  servers: Server[],
  cluster?: Pick<MagnumCluster, "stack_id">,
  siblingGroups: Array<Pick<MagnumClusterNodeGroup, "name" | "role">> = [],
) {
  const nodeAddresses = new Set(
    (nodeGroup.node_addresses ?? []).map(normalizedAddress),
  );
  const addressMatches = servers.filter((server) =>
    Object.values(server.addresses).some((addresses) =>
      addresses.some(({ addr }) => nodeAddresses.has(normalizedAddress(addr))),
    ),
  );
  if (addressMatches.length > 0 || !cluster?.stack_id) {
    return addressMatches;
  }

  const stackPrefix = `${cluster.stack_id}-`;
  const clusterServers = servers.filter((server) =>
    server.name.startsWith(stackPrefix),
  );
  if (nodeGroup.role !== "master") {
    return clusterServers.filter((server) =>
      server.name.includes(`-${nodeGroup.name}-`),
    );
  }

  const workerNames = siblingGroups
    .filter(({ role }) => role !== "master")
    .map(({ name }) => `-${name}-`);
  return clusterServers.filter(
    (server) => !workerNames.some((name) => server.name.includes(name)),
  );
}
