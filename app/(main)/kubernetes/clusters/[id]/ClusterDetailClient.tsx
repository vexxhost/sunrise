"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Box,
  Boxes,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  Gauge,
  Globe2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Scaling,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { IDCell } from "@/components/DataTable/IDCell";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { DriverConfigurationTable } from "@/components/Kubernetes/DriverConfigurationTable";
import { ClusterLifecycleActions } from "@/components/Kubernetes/ClusterLifecycleActions";
import { NodeGroupMutationSheet } from "@/components/Kubernetes/NodeGroupMutationSheet";
import { NodeGroupResizeDialog } from "@/components/Kubernetes/NodeGroupResizeDialog";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import {
  clusterNodeGroupsQueryOptions,
  clusterQueryOptions,
  clusterTemplatesQueryOptions,
} from "@/hooks/queries/useMagnum";
import {
  networksQueryOptions,
  visibleSubnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import {
  clusterKubernetesVersion,
  getKubernetesHealthDiagnostics,
} from "@/lib/openstack/magnum-domain";
import { deleteClusterNodeGroupAction } from "@/lib/openstack/magnum-actions";
import type {
  Flavor,
  Image,
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

function isTransitioning(status: string | undefined) {
  return Boolean(status?.endsWith("_IN_PROGRESS"));
}

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Enabled" : "Disabled";
}

function labelBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function parseEndpoint(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return {
      href: parsed.href,
      display: `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
      protocol: parsed.protocol.replace(":", "").toUpperCase(),
    };
  } catch {
    return { href: value, display: value, protocol: "Kubernetes API" };
  }
}

function SummaryTile({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: React.ReactNode;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 min-w-0 truncate text-lg font-semibold">{value}</div>
      <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

function ApiEndpointTile({
  endpoint,
  isPublic,
}: {
  endpoint: ReturnType<typeof parseEndpoint>;
  isPublic: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = isPublic ? Globe2 : LockKeyhole;
  const displayEndpoint = endpoint
    ? `${endpoint.protocol.toLowerCase()}://${endpoint.display}`
    : "No endpoint reported";

  const handleCopy = async () => {
    if (!endpoint) return;
    await navigator.clipboard.writeText(endpoint.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <div className="min-w-0 rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        Kubernetes API
      </div>
      <div className="mt-2 truncate text-lg font-semibold">
        {endpoint
          ? isPublic
            ? "Public endpoint"
            : "Private endpoint"
          : "Not available"}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <span
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={displayEndpoint}
        >
          {displayEndpoint}
        </span>
        {endpoint ? (
          <Button
            aria-label="Copy Kubernetes API endpoint"
            className="size-6 shrink-0"
            onClick={handleCopy}
            size="icon"
            title={copied ? "Endpoint copied" : "Copy endpoint"}
            type="button"
            variant="ghost"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function HealthPanel({ cluster }: { cluster: MagnumCluster }) {
  const diagnostics = getKubernetesHealthDiagnostics(cluster);
  const available =
    Boolean(cluster.health_status) || Object.keys(diagnostics.raw).length > 0;
  const unhealthy =
    diagnostics.issues.length > 0 ||
    (Boolean(cluster.health_status) &&
      cluster.health_status?.toUpperCase() !== "HEALTHY");

  return (
    <section
      className={
        !available
          ? "overflow-hidden rounded-md border bg-muted/20"
          : unhealthy
            ? "overflow-hidden rounded-md border border-destructive/40 bg-destructive/5"
            : "overflow-hidden rounded-md border border-emerald-500/30 bg-emerald-500/5"
      }
    >
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          {!available ? (
            <CircleHelp className="mt-0.5 size-5 text-muted-foreground" />
          ) : unhealthy ? (
            <TriangleAlert className="mt-0.5 size-5 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {!available
                ? "Health checks unavailable"
                : unhealthy
                  ? "Health issues"
                  : "Cluster checks are healthy"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {!available
                ? "Magnum has not reported API or machine readiness yet."
                : diagnostics.machineCount > 0
                  ? `${diagnostics.readyMachineCount} of ${diagnostics.machineCount} Cluster API machines are ready.`
                  : "Magnum has not reported machine-level readiness checks."}
            </p>
          </div>
        </div>
        {diagnostics.apiReady !== null ? (
          <Badge variant={diagnostics.apiReady ? "default" : "destructive"}>
            API {diagnostics.apiReady ? "ready" : "not ready"}
          </Badge>
        ) : null}
      </div>

      {available && unhealthy ? (
        diagnostics.issues.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Affected resource</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell>
                      <div className="font-medium">{issue.summary}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {issue.resourceType}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {issue.resource}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">{issue.state}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Magnum reports {displayStatus(cluster.health_status || "unknown")},
            but did not return a machine-level reason. Refresh after the next
            health check for more detail.
          </p>
        )
      ) : null}

      {Object.keys(diagnostics.raw).length > 0 ? (
        <details className="border-t px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Health Status Reason
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {JSON.stringify(diagnostics.raw, null, 2)}
          </pre>
        </details>
      ) : null}
      <details
        className="border-t px-4 py-3 text-sm"
        open={
          isTransitioning(cluster.status) || cluster.status.endsWith("_FAILED")
            ? true
            : undefined
        }
      >
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
          Status Reason
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {cluster.status_reason || "No status details reported."}
        </p>
      </details>
    </section>
  );
}

function ResourceLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return href ? (
    <Link
      className="underline-offset-2 hover:underline focus-visible:underline"
      href={href}
    >
      {children}
    </Link>
  ) : (
    children
  );
}

function NodeGroupsTable({
  autoScalingEnabled,
  cluster,
  flavors,
  images,
  isRefetching,
  nodeGroups,
  projectId,
  refetch,
  regionId,
}: {
  autoScalingEnabled: boolean;
  cluster: MagnumCluster;
  flavors: Flavor[];
  images: Image[];
  isRefetching: boolean;
  nodeGroups: MagnumClusterNodeGroup[];
  projectId?: string;
  refetch: () => void;
  regionId?: string;
}) {
  type NodeGroupRow = MagnumClusterNodeGroup & {
    availabilityZone: string;
    flavor?: Flavor;
    flavorName: string;
    image?: Image;
    imageName: string;
    scalingDetail: string;
    scalingPolicy: string;
    detailHref?: string;
  };

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MagnumClusterNodeGroup | null>(null);
  const [resizing, setResizing] = useState<MagnumClusterNodeGroup | null>(null);
  const [deleting, setDeleting] = useState<MagnumClusterNodeGroup | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const queryClient = useQueryClient();

  const rows = useMemo<NodeGroupRow[]>(() => {
    const sourceRows: MagnumClusterNodeGroup[] =
      nodeGroups.length > 0
        ? nodeGroups
        : [
            {
              uuid: `${cluster.uuid}-control-plane`,
              name: "default-master",
              role: "master",
              node_count: cluster.master_count ?? 0,
              flavor_id: cluster.master_flavor_id,
              image_id: cluster.cluster_template?.image_id,
              status: cluster.status,
              is_default: true,
            },
            {
              uuid: `${cluster.uuid}-workers`,
              name: "default-worker",
              role: "worker",
              node_count: cluster.node_count ?? 0,
              flavor_id: cluster.flavor_id,
              image_id: cluster.cluster_template?.image_id,
              status: cluster.status,
              is_default: true,
            },
          ];

    return sourceRows.map((nodeGroup) => {
      const flavor = flavors.find(
        (candidate) =>
          candidate.id === nodeGroup.flavor_id ||
          candidate.name === nodeGroup.flavor_id,
      );
      const image = images.find(
        (candidate) =>
          candidate.id === nodeGroup.image_id ||
          candidate.name === nodeGroup.image_id,
      );
      const isControlPlane = nodeGroup.role === "master";
      const minimum = nodeGroup.min_node_count ?? nodeGroup.node_count;
      const configuredMaximum =
        nodeGroup.max_node_count ??
        (nodeGroup.labels?.max_node_count
          ? Number(nodeGroup.labels.max_node_count)
          : undefined);
      const maximum = configuredMaximum ?? minimum + 1;

      return {
        ...nodeGroup,
        detailHref:
          nodeGroups.length > 0
            ? `/kubernetes/clusters/${cluster.uuid}/node-groups/${nodeGroup.uuid}`
            : undefined,
        availabilityZone: nodeGroup.labels?.availability_zone || "Inherited",
        flavor,
        flavorName: flavor?.name || nodeGroup.flavor_id || "-",
        image,
        imageName: image?.name || nodeGroup.image_id || "-",
        scalingDetail:
          autoScalingEnabled && !isControlPlane
            ? "Autoscaler bounds"
            : "Manual capacity",
        scalingPolicy:
          !autoScalingEnabled || isControlPlane
            ? `Fixed at ${nodeGroup.node_count}`
            : `${minimum} - ${maximum}`,
      };
    });
  }, [autoScalingEnabled, cluster, flavors, images, nodeGroups]);

  const columns = useMemo<ColumnDef<NodeGroupRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div
            className="max-w-44 truncate font-medium"
            title={row.original.name}
          >
            <ResourceLink href={row.original.detailHref}>
              {row.original.name}
            </ResourceLink>
          </div>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "uuid",
        header: "UUID",
        enableHiding: false,
        cell: ({ row }) => (
          <IDCell
            isSelected={row.getIsSelected()}
            linkPath={
              row.original.detailHref
                ? `/kubernetes/clusters/${cluster.uuid}/node-groups`
                : undefined
            }
            value={row.original.uuid}
          />
        ),
        meta: {
          fieldType: "string",
          monospace: true,
          visible: true,
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status ? (
            isTransitioning(row.original.status) ? (
              <ProgressStatusBadge label={displayStatus(row.original.status)} />
            ) : (
              <Badge variant={statusVariant(row.original.status)}>
                {displayStatus(row.original.status)}
              </Badge>
            )
          ) : (
            "-"
          ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "node_count",
        header: "Nodes",
        meta: { fieldType: "number", visible: true },
      },
      {
        accessorKey: "flavorName",
        header: "Flavor",
        cell: ({ row }) => (
          <ResourceLink
            href={
              row.original.flavor
                ? `/compute/instance-flavors/${row.original.flavor.id}`
                : undefined
            }
          >
            {row.original.flavorName}
          </ResourceLink>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "scalingPolicy",
        header: "Scaling",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <div className="font-medium">{row.original.scalingPolicy}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.scalingDetail}
            </div>
          </div>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "imageName",
        header: "Image",
        cell: ({ row }) => (
          <div className="max-w-64 truncate" title={row.original.imageName}>
            <ResourceLink
              href={
                row.original.image
                  ? `/compute/images/${row.original.image.id}`
                  : undefined
              }
            >
              {row.original.imageName}
            </ResourceLink>
          </div>
        ),
        meta: { fieldType: "string", visible: false },
      },
      {
        accessorKey: "availabilityZone",
        header: "Availability Zone",
        meta: { fieldType: "string", visible: false },
      },
    ],
    [cluster.uuid],
  );

  const rowActions = useMemo(
    () => [
      {
        label: "Scale",
        icon: Scaling,
        onClick: (selected: NodeGroupRow[]) => setResizing(selected[0] ?? null),
        isDisabled: (selected: NodeGroupRow[]) =>
          selected.length !== 1 || isTransitioning(selected[0]?.status),
      },
      {
        label: "Edit settings",
        icon: Pencil,
        onClick: (selected: NodeGroupRow[]) => setEditing(selected[0] ?? null),
        isDisabled: (selected: NodeGroupRow[]) =>
          selected.length !== 1 ||
          selected[0]?.role === "master" ||
          isTransitioning(selected[0]?.status),
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (selected: NodeGroupRow[]) => {
          setDeleteError(null);
          setDeleteConfirmation("");
          setDeleting(selected[0] ?? null);
        },
        isDisabled: (selected: NodeGroupRow[]) =>
          selected.length !== 1 ||
          Boolean(selected[0]?.is_default) ||
          selected[0]?.role === "master" ||
          isTransitioning(selected[0]?.status),
      },
    ],
    [],
  );

  const deleteNodeGroup = () => {
    if (!deleting || !projectId || !regionId) return;
    if (deleteConfirmation !== deleting.name) {
      setDeleteError(`Enter ${deleting.name} to confirm deletion.`);
      return;
    }
    startDeleteTransition(async () => {
      setDeleteError(null);
      const result = await deleteClusterNodeGroupAction(
        { projectId, regionId },
        cluster.uuid,
        deleting,
      );
      if (!result.ok) {
        setDeleteError(result.error.message);
        return;
      }
      queryClient.setQueryData<MagnumClusterNodeGroup[]>(
        clusterNodeGroupsQueryOptions(regionId, projectId, cluster.uuid)
          .queryKey,
        (current) =>
          current?.map((nodeGroup) =>
            nodeGroup.uuid === deleting.uuid
              ? { ...nodeGroup, status: "DELETE_IN_PROGRESS" }
              : nodeGroup,
          ),
      );
      setDeleting(null);
      setDeleteConfirmation("");
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          disabled={!projectId || !regionId || isTransitioning(cluster.status)}
          onClick={() => setCreating(true)}
          size="sm"
          type="button"
        >
          <Plus className="size-4" />
          Add node group
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        emptyIcon={Boxes}
        getRowId={(row) => row.uuid}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="node group"
        rowActions={rowActions}
      />
      {creating ? (
        <NodeGroupMutationSheet
          cluster={cluster}
          flavors={flavors}
          onComplete={refetch}
          onOpenChange={setCreating}
          open
          projectId={projectId}
          regionId={regionId}
        />
      ) : null}
      {editing ? (
        <NodeGroupMutationSheet
          cluster={cluster}
          flavors={flavors}
          nodeGroup={editing}
          onComplete={refetch}
          onOpenChange={(open) => !open && setEditing(null)}
          open
          projectId={projectId}
          regionId={regionId}
        />
      ) : null}
      {resizing ? (
        <NodeGroupResizeDialog
          autoScalingEnabled={autoScalingEnabled}
          cluster={cluster}
          nodeGroup={resizing}
          onOpenChange={(open) => !open && setResizing(null)}
          open
          projectId={projectId}
          regionId={regionId}
        />
      ) : null}
      <MutationConfirmationDialog
        confirmLabel="Delete node group"
        confirmDisabled={deleteConfirmation !== deleting?.name}
        description="Magnum will remove this worker group and its machines. Workloads must be able to reschedule elsewhere."
        error={deleteError}
        onConfirm={deleteNodeGroup}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteConfirmation("");
          }
        }}
        open={Boolean(deleting)}
        pending={isDeleting}
        pendingLabel="Starting deletion"
        title={`Delete ${deleting?.name ?? "node group"}?`}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="node-group-delete-confirmation">
            Enter <span className="font-mono">{deleting?.name}</span> to confirm
          </Label>
          <Input
            autoComplete="off"
            id="node-group-delete-confirmation"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
          />
          {deleteConfirmation && deleteConfirmation !== deleting?.name ? (
            <p className="text-xs text-destructive">
              Node-group name does not match.
            </p>
          ) : null}
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}

export function ClusterDetailClient({
  activeTab,
  clusterId,
  projectId,
  regionId,
}: ClusterDetailClientProps) {
  const router = useRouter();
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
  } = useSuspenseQuery({
    ...clusterQuery,
    refetchInterval: ({ state }) => {
      if (!state.data) return false;
      if (isTransitioning(state.data.status)) return 5_000;
      return state.data.health_status &&
        state.data.health_status.toUpperCase() !== "HEALTHY"
        ? 15_000
        : false;
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const {
    data: nodeGroupData,
    isRefetching: isNodeGroupsRefetching,
    refetch: refetchNodeGroups,
  } = useSuspenseQuery({
    ...nodeGroupsQuery,
    refetchInterval: ({ state }) =>
      Array.isArray(state.data) &&
      state.data.some((nodeGroup) => isTransitioning(nodeGroup.status))
        ? 5_000
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const {
    data: templates,
    isRefetching: isTemplatesRefetching,
    refetch: refetchTemplates,
  } = useSuspenseQuery(templatesQuery);
  const { data: networks = [] } = useQuery(
    networksQueryOptions(regionId, projectId),
  );
  const { data: subnets = [] } = useQuery(
    visibleSubnetsQueryOptions(regionId, projectId),
  );
  const { data: images = [] } = useQuery(
    imagesQueryOptions(regionId, projectId),
  );
  const { data: flavors = [] } = useQuery(
    flavorsQueryOptions(regionId, projectId),
  );
  const nodeGroups = Array.isArray(nodeGroupData) ? nodeGroupData : [];
  const template = useMemo(
    () =>
      cluster.cluster_template ??
      templates.find(
        (candidate: MagnumClusterTemplate) =>
          candidate.uuid === cluster.cluster_template_id,
      ),
    [cluster.cluster_template, cluster.cluster_template_id, templates],
  );
  const clusterWithTemplate = useMemo(
    () => ({ ...cluster, cluster_template: template }),
    [cluster, template],
  );
  const labels = useMemo(
    () => ({ ...(template?.labels ?? {}), ...(cluster.labels ?? {}) }),
    [cluster.labels, template?.labels],
  );
  const apiEndpoint = parseEndpoint(cluster.api_address);
  const kubernetesVersion = clusterKubernetesVersion(clusterWithTemplate);
  const controlNodes =
    nodeGroups
      .filter((nodeGroup) => nodeGroup.role === "master")
      .reduce((total, nodeGroup) => total + nodeGroup.node_count, 0) ||
    cluster.master_count ||
    0;
  const workerNodes =
    nodeGroups
      .filter((nodeGroup) => nodeGroup.role !== "master")
      .reduce((total, nodeGroup) => total + nodeGroup.node_count, 0) ||
    cluster.node_count ||
    0;
  const externalNetwork = networks.find(
    (network) =>
      network.id === template?.external_network_id ||
      network.name === template?.external_network_id,
  );
  const fixedNetwork = networks.find(
    (network) =>
      network.id === cluster.fixed_network ||
      network.name === cluster.fixed_network,
  );
  const fixedSubnet = subnets.find(
    (subnet) =>
      subnet.id === cluster.fixed_subnet ||
      subnet.name === cluster.fixed_subnet,
  );
  const isRefreshing =
    isClusterRefetching || isNodeGroupsRefetching || isTemplatesRefetching;
  const [selectedTab, setSelectedTab] =
    useState<KubernetesClusterDetailTab>(activeTab);

  useEffect(() => {
    const handlePopState = () => {
      const tab = window.location.pathname.split("/").filter(Boolean).at(-1);
      if (tab && isKubernetesClusterDetailTab(tab)) setSelectedTab(tab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleTabChange = (value: string) => {
    if (!isKubernetesClusterDetailTab(value)) return;
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
      <RecentResourceTracker
        kind="cluster"
        id={cluster.uuid}
        name={cluster.name || "Unnamed cluster"}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
              {cluster.name || "Unnamed cluster"}
            </h1>
            {isTransitioning(cluster.status) ? (
              <ProgressStatusBadge label={displayStatus(cluster.status)} />
            ) : (
              <Badge variant={statusVariant(cluster.status)}>
                {displayStatus(cluster.status)}
              </Badge>
            )}
            {cluster.health_status ? (
              <Badge
                variant={
                  cluster.health_status.toUpperCase() === "HEALTHY"
                    ? "default"
                    : "destructive"
                }
              >
                {displayStatus(cluster.health_status)}
              </Badge>
            ) : null}
          </div>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {cluster.uuid}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-9 gap-2"
            disabled={isRefreshing}
            onClick={handleRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <ClusterLifecycleActions
            cluster={clusterWithTemplate}
            nodeGroups={nodeGroups}
            onDeleted={() =>
              router.replace(
                `/kubernetes/clusters?deleting=${encodeURIComponent(cluster.uuid)}`,
              )
            }
            onMutationAccepted={async () => {
              await Promise.all([refetchCluster(), refetchNodeGroups()]);
            }}
            projectId={projectId}
            regionId={regionId}
            templates={templates}
          />
        </div>
      </div>

      <HealthPanel cluster={cluster} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={Gauge}
          label="Kubernetes version"
          value={kubernetesVersion}
          detail="Cluster-wide version"
        />
        <SummaryTile
          icon={Boxes}
          label="Nodes"
          value={controlNodes + workerNodes}
          detail={`${controlNodes} control plane / ${workerNodes} worker`}
        />
        <SummaryTile
          icon={Box}
          label="Cluster template"
          value={
            template ? (
              <Link
                className="hover:underline focus-visible:underline"
                href={`/kubernetes/templates/${template.uuid}`}
              >
                {template.name}
              </Link>
            ) : (
              cluster.cluster_template_id
            )
          }
          detail="Configuration and upgrade source"
        />
        <ApiEndpointTile
          endpoint={apiEndpoint}
          isPublic={labelBoolean(
            labels.master_lb_floating_ip_enabled,
            cluster.floating_ip_enabled ?? true,
          )}
        />
      </div>

      <Tabs
        className="space-y-4"
        value={selectedTab}
        onValueChange={handleTabChange}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="node-groups">Node groups</TabsTrigger>
          <TabsTrigger value="networking">Networking</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="add-ons">Add-ons</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="overview">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Operations">
              <DetailField label="Automatic healing">
                {yesNo(labelBoolean(labels.auto_healing_enabled, true))}
              </DetailField>
              <DetailField label="Automatic scaling">
                {yesNo(labelBoolean(labels.auto_scaling_enabled, false))}
              </DetailField>
              <DetailField label="Create timeout">
                {cluster.create_timeout
                  ? `${cluster.create_timeout} minutes`
                  : "-"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Placement">
              <DetailField label="Default compute availability zone">
                {labels.availability_zone || "Cloud scheduler"}
              </DetailField>
              <DetailField label="Control plane availability zones">
                {labels.control_plane_availability_zones || "Inherited"}
              </DetailField>
              <DetailField label="Different failure domains">
                {yesNo(labelBoolean(labels.different_failure_domain, false))}
              </DetailField>
              <DetailField label="Server group policies">
                {labels.server_group_policies || "soft-anti-affinity"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Identity and timeline">
              <DetailField label="Cluster ID" className="font-mono text-xs">
                {cluster.uuid}
              </DetailField>
              <DetailField label="Stack ID" className="font-mono text-xs">
                {emptyToDash(cluster.stack_id)}
              </DetailField>
              <DetailField label="Created">
                {emptyToDash(cluster.created_at)}
              </DetailField>
              <DetailField label="Updated">
                {emptyToDash(cluster.updated_at)}
              </DetailField>
              <DetailField label="Project ID" className="font-mono text-xs">
                {emptyToDash(cluster.project_id)}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent className="space-y-3" value="node-groups">
          <div>
            <h2 className="text-sm font-semibold">Node groups</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All node groups run Kubernetes {kubernetesVersion}. Magnum Cluster
              API upgrades the cluster and every node group together.
            </p>
          </div>
          <NodeGroupsTable
            autoScalingEnabled={labelBoolean(
              labels.auto_scaling_enabled,
              false,
            )}
            cluster={clusterWithTemplate}
            flavors={flavors}
            images={images}
            isRefetching={isNodeGroupsRefetching}
            nodeGroups={nodeGroups}
            projectId={projectId}
            refetch={() => {
              void refetchNodeGroups();
            }}
            regionId={regionId}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="networking">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Kubernetes networking">
              <DetailField label="Pod network">
                {template?.network_driver || "-"}
              </DetailField>
              <DetailField label="Pod CIDR">
                {labels.cilium_ipv4pool ||
                  labels.calico_ipv4pool ||
                  "10.100.0.0/16"}
              </DetailField>
              <DetailField label="Service CIDR">
                {labels.service_cluster_ip_range || "10.254.0.0/16"}
              </DetailField>
              <DetailField label="Cluster domain">
                {labels.dns_cluster_domain || "cluster.local"}
              </DetailField>
              <DetailField label="DNS resolvers">
                {template?.dns_nameserver || "-"}
              </DetailField>
            </DetailSection>
            <DetailSection title="OpenStack connectivity">
              <DetailField label="External network">
                <ResourceLink
                  href={
                    externalNetwork
                      ? `/compute/networks/resources/${externalNetwork.id}`
                      : undefined
                  }
                >
                  {externalNetwork?.name ||
                    template?.external_network_id ||
                    "-"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Fixed network">
                <ResourceLink
                  href={
                    fixedNetwork
                      ? `/compute/networks/resources/${fixedNetwork.id}`
                      : undefined
                  }
                >
                  {fixedNetwork?.name || cluster.fixed_network || "-"}
                </ResourceLink>
              </DetailField>
              <DetailField label="Fixed subnet">
                {fixedSubnet?.name ||
                  fixedSubnet?.cidr ||
                  cluster.fixed_subnet ||
                  "-"}
              </DetailField>
              <DetailField label="Fixed subnet CIDR">
                {fixedSubnet?.cidr || labels.fixed_subnet_cidr || "10.0.0.0/24"}
              </DetailField>
            </DetailSection>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Kubernetes API access">
              <DetailField label="API load balancer">
                {yesNo(
                  cluster.master_lb_enabled ?? template?.master_lb_enabled,
                )}
              </DetailField>
              <DetailField label="Public API address">
                {yesNo(
                  labelBoolean(
                    labels.master_lb_floating_ip_enabled,
                    cluster.floating_ip_enabled ?? true,
                  ),
                )}
              </DetailField>
              <DetailField label="Requested API floating IP">
                {labels.api_server_floating_ip || "Automatic"}
              </DetailField>
              <DetailField label="API load balancer flavor">
                {labels.api_server_lb_flavor || "Cloud default"}
              </DetailField>
              <DetailField label="API load balancer availability zone">
                {labels.api_server_lb_availability_zone || "Cloud default"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Kubernetes Services">
              <DetailField label="Octavia provider">
                {labels.octavia_provider || "amphorav2"}
              </DetailField>
              <DetailField label="Load balancer algorithm">
                {labels.octavia_lb_algorithm || "Provider default"}
              </DetailField>
              <DetailField label="Health monitors">
                {yesNo(labelBoolean(labels.octavia_lb_healthcheck, true))}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent className="space-y-4" value="storage">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Node storage">
              <DetailField label="Boot volume size">
                {labels.boot_volume_size
                  ? `${labels.boot_volume_size} GiB`
                  : "Cloud default"}
              </DetailField>
              <DetailField label="Boot volume type">
                {labels.boot_volume_type || "Cloud default"}
              </DetailField>
              <DetailField label="Boot volume availability zone">
                {labels.boot_volume_availability_zone ||
                  labels.availability_zone ||
                  "Inherited"}
              </DetailField>
              <DetailField label="etcd volume size">
                {Number(labels.etcd_volume_size || 0) > 0
                  ? `${labels.etcd_volume_size} GiB`
                  : "Root disk"}
              </DetailField>
              <DetailField label="etcd volume type">
                {labels.etcd_volume_type || "Cloud default"}
              </DetailField>
              <DetailField label="Legacy container volume">
                {template?.docker_volume_size
                  ? `${template.docker_volume_size} GiB`
                  : "Disabled"}
              </DetailField>
              <DetailField label="Legacy container volume type">
                {template?.docker_volume_size
                  ? labels.docker_volume_type || "Cloud default"
                  : "Not applicable"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Workload storage">
              <DetailField label="Cinder CSI">
                {yesNo(labelBoolean(labels.cinder_csi_enabled, true))}
              </DetailField>
              <DetailField label="Cinder CSI version">
                {labels.cinder_csi_plugin_tag || "Driver default"}
              </DetailField>
              <DetailField label="Manila CSI">
                {yesNo(labelBoolean(labels.manila_csi_enabled, true))}
              </DetailField>
              <DetailField label="Manila CSI version">
                {labels.manila_csi_plugin_tag || "Driver default"}
              </DetailField>
              <DetailField label="Manila share network">
                {labels.manila_csi_share_network_id || "Not configured"}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent className="space-y-4" value="security">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailSection title="Kubernetes API">
              <DetailField label="Endpoint">
                {apiEndpoint ? (
                  <a
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                    href={apiEndpoint.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {apiEndpoint.href}
                  </a>
                ) : (
                  "-"
                )}
              </DetailField>
              <DetailField label="TLS">
                {template?.tls_disabled ? "Disabled" : "Enabled"}
              </DetailField>
              <DetailField label="Additional certificate SANs">
                {labels.api_server_cert_sans || "None"}
              </DetailField>
              <DetailField label="SSH key pair">
                {cluster.keypair || template?.keypair_id || "-"}
              </DetailField>
              <DetailField label="Keystone authentication">
                {yesNo(labelBoolean(labels.keystone_auth_enabled, true))}
              </DetailField>
            </DetailSection>
            <DetailSection title="OpenID Connect">
              <DetailField label="Issuer URL">
                {labels.oidc_issuer_url || "Not configured"}
              </DetailField>
              <DetailField label="Client ID">
                {labels.oidc_client_id || "-"}
              </DetailField>
              <DetailField label="Username claim">
                {labels.oidc_username_claim || "sub"}
              </DetailField>
              <DetailField label="Username prefix">
                {labels.oidc_username_prefix || "-"}
              </DetailField>
              <DetailField label="Groups claim">
                {labels.oidc_groups_claim || "-"}
              </DetailField>
              <DetailField label="Groups prefix">
                {labels.oidc_groups_prefix || "-"}
              </DetailField>
            </DetailSection>
            <DetailSection title="Admission and TLS policy">
              <DetailField label="Admission plugins">
                {labels.admission_control_list
                  ? `NodeRestriction,${labels.admission_control_list}`
                  : "NodeRestriction"}
              </DetailField>
              <DetailField label="API server TLS cipher suites">
                {labels.api_server_tls_cipher_suites ||
                  "Driver secure defaults"}
              </DetailField>
              <DetailField label="Kubelet TLS cipher suites">
                {labels.kubelet_tls_cipher_suites || "Driver secure defaults"}
              </DetailField>
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent className="space-y-4" value="add-ons">
          <div>
            <h2 className="text-sm font-semibold">Cluster add-ons</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Integrations installed by Magnum Cluster API and the effective
              versions selected for this cluster.
            </p>
          </div>
          <DriverConfigurationTable
            categories={["Component images"]}
            labels={labels}
            networkDriver={template?.network_driver}
            sourceFor={(key) =>
              cluster.labels?.[key] !== undefined
                ? "Cluster override"
                : "Template"
            }
          />
          <DetailSection title="Proxy configuration">
            <DetailField label="HTTP proxy">
              {template?.http_proxy || "Not configured"}
            </DetailField>
            <DetailField label="HTTPS proxy">
              {template?.https_proxy || "Not configured"}
            </DetailField>
            <DetailField label="No proxy">
              {template?.no_proxy || "Not configured"}
            </DetailField>
          </DetailSection>
        </TabsContent>

        <TabsContent className="space-y-4" value="labels">
          <div>
            <h2 className="text-sm font-semibold">
              Effective driver configuration
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cluster overrides take precedence over template labels. Unset
              values continue to follow the Magnum Cluster API driver.
            </p>
          </div>
          <DriverConfigurationTable
            labels={labels}
            networkDriver={template?.network_driver}
            sourceFor={(key) =>
              cluster.labels?.[key] !== undefined
                ? "Cluster override"
                : "Template"
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
