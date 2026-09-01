"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  RotateCw,
  Scaling,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clusterQueryOptions } from "@/hooks/queries/useMagnum";
import { getClusterCertificateAction } from "@/lib/openstack/magnum";
import {
  deleteClusterAction,
  resizeClusterAction,
  signClusterCertificateAction,
  updateClusterNodeGroupAction,
  upgradeClusterAction,
} from "@/lib/openstack/magnum-actions";
import {
  buildKubeconfig,
  generateKubeconfigCredentials,
} from "@/lib/openstack/kubeconfig";
import { normalizeKubernetesVersion } from "@/lib/openstack/magnum-domain";
import type {
  MagnumCluster,
  MagnumClusterNodeGroup,
  MagnumClusterTemplate,
} from "@/types/openstack";

type ClusterDialog = "access" | "resize" | "upgrade" | "delete" | null;

interface ClusterLifecycleActionsProps {
  cluster: MagnumCluster;
  nodeGroups: MagnumClusterNodeGroup[];
  onDeleted: () => void;
  onMutationAccepted: () => Promise<void> | void;
  projectId?: string;
  regionId?: string;
  templates: MagnumClusterTemplate[];
}

function templateVersion(template: MagnumClusterTemplate) {
  return (
    normalizeKubernetesVersion(template.labels?.kube_tag) || "Not reported"
  );
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function labelEnabled(value?: string) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function autoscalerMaximum(nodeGroup: MagnumClusterNodeGroup) {
  if (
    nodeGroup.max_node_count !== null &&
    nodeGroup.max_node_count !== undefined
  ) {
    return nodeGroup.max_node_count;
  }
  const labelMaximum = nodeGroup.labels?.max_node_count
    ? Number(nodeGroup.labels.max_node_count)
    : Number.NaN;
  return Number.isFinite(labelMaximum)
    ? labelMaximum
    : (nodeGroup.min_node_count ?? 0) + 1;
}

export function ClusterLifecycleActions({
  cluster,
  nodeGroups,
  onDeleted,
  onMutationAccepted,
  projectId,
  regionId,
  templates,
}: ClusterLifecycleActionsProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<ClusterDialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodeGroupName, setNodeGroupName] = useState(
    nodeGroups.find((nodeGroup) => nodeGroup.role !== "master")?.name ??
      nodeGroups[0]?.name ??
      "",
  );
  const [nodeCount, setNodeCount] = useState("");
  const [minNodeCount, setMinNodeCount] = useState("");
  const [maxNodeCount, setMaxNodeCount] = useState("");
  const [upgradeTemplateId, setUpgradeTemplateId] = useState("");
  const [maxBatchSize, setMaxBatchSize] = useState("1");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedNodeGroup = nodeGroups.find(
    (nodeGroup) => nodeGroup.name === nodeGroupName,
  );
  const autoScalingEnabled = labelEnabled(cluster.labels?.auto_scaling_enabled);
  const selectedUsesAutoscaler =
    autoScalingEnabled && selectedNodeGroup?.role !== "master";
  const upgradeTemplates = useMemo(() => {
    const currentVersion = normalizeKubernetesVersion(
      cluster.coe_version ??
        cluster.labels?.kube_tag ??
        cluster.cluster_template?.labels?.kube_tag,
    );
    return templates
      .filter((template) => {
        if (template.uuid === cluster.cluster_template_id) return false;
        const targetVersion = normalizeKubernetesVersion(
          template.labels?.kube_tag,
        );
        return Boolean(
          targetVersion &&
          (!currentVersion ||
            compareVersions(targetVersion, currentVersion) >= 0),
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [cluster, templates]);
  const transitioning = cluster.status.endsWith("_IN_PROGRESS");
  const scopeReady = Boolean(projectId && regionId);
  const ready = scopeReady && !transitioning;
  const deletionStarted = cluster.status === "DELETE_IN_PROGRESS";

  const openDialog = (nextDialog: Exclude<ClusterDialog, null>) => {
    setError(null);
    if (nextDialog === "resize") {
      const initial =
        selectedNodeGroup ??
        nodeGroups.find((nodeGroup) => nodeGroup.role !== "master") ??
        nodeGroups[0];
      if (initial) {
        setNodeGroupName(initial.name);
        setNodeCount(String(initial.node_count));
        setMinNodeCount(String(initial.min_node_count ?? 0));
        setMaxNodeCount(String(autoscalerMaximum(initial)));
      }
    }
    if (nextDialog === "upgrade") {
      setUpgradeTemplateId(upgradeTemplates[0]?.uuid ?? "");
      setMaxBatchSize("1");
    }
    if (nextDialog === "delete") setDeleteConfirmation("");
    setDialog(nextDialog);
  };

  const closeDialog = () => {
    if (isPending) return;
    setError(null);
    setDialog(null);
  };

  const refreshMagnum = async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "magnum"],
    });
    await onMutationAccepted();
  };

  const scale = () => {
    if (!projectId || !regionId || !selectedNodeGroup) return;
    startTransition(async () => {
      setError(null);
      const result = selectedUsesAutoscaler
        ? await updateClusterNodeGroupAction(
            { projectId, regionId },
            cluster.uuid,
            selectedNodeGroup,
            {
              minNodeCount: Number(minNodeCount),
              maxNodeCount: Number(maxNodeCount),
            },
          )
        : await resizeClusterAction({ projectId, regionId }, cluster.uuid, {
            autoScalingEnabled,
            nodeGroup: selectedNodeGroup.name,
            nodeCount: Number(nodeCount),
            role: selectedNodeGroup.role,
            minNodeCount: selectedNodeGroup.min_node_count,
            maxNodeCount: selectedNodeGroup.max_node_count,
          });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refreshMagnum();
    });
  };

  const upgrade = () => {
    if (!projectId || !regionId) return;
    startTransition(async () => {
      setError(null);
      const result = await upgradeClusterAction(
        { projectId, regionId },
        cluster.uuid,
        {
          clusterTemplateId: upgradeTemplateId,
          maxBatchSize: Number(maxBatchSize),
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refreshMagnum();
    });
  };

  const remove = () => {
    if (!projectId || !regionId) return;
    if (deleteConfirmation !== cluster.name) {
      setError(`Enter ${cluster.name} to confirm deletion.`);
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await deleteClusterAction(
        { projectId, regionId },
        cluster.uuid,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      queryClient.setQueriesData<MagnumCluster[]>(
        {
          queryKey: [regionId, projectId, "magnum", "clusters"],
        },
        (current) =>
          current?.map((candidate) =>
            candidate.uuid === cluster.uuid
              ? {
                  ...candidate,
                  status: "DELETE_IN_PROGRESS",
                  status_reason:
                    "Magnum accepted the cluster deletion request.",
                }
              : candidate,
          ),
      );
      queryClient.setQueryData<MagnumCluster>(
        clusterQueryOptions(regionId, projectId, cluster.uuid).queryKey,
        (current) =>
          current
            ? {
                ...current,
                status: "DELETE_IN_PROGRESS",
                status_reason: "Magnum accepted the cluster deletion request.",
              }
            : current,
      );
      setDialog(null);
      onDeleted();
    });
  };

  const downloadKubeconfig = () => {
    const endpoint = cluster.api_address;
    if (!projectId || !regionId || !endpoint) return;
    startTransition(async () => {
      setError(null);
      try {
        const credentials = await generateKubeconfigCredentials(cluster.name);
        const result = await signClusterCertificateAction(
          { projectId, regionId },
          cluster.uuid,
          credentials.csr,
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }

        const caCertificate = await getClusterCertificateAction(
          cluster.uuid,
          regionId,
        );
        const kubeconfig = buildKubeconfig({
          caCertificatePem: caCertificate.pem,
          clientCertificatePem: result.data.pem,
          clusterName: cluster.name,
          endpoint,
          privateKeyPem: credentials.privateKeyPem,
        });
        const url = URL.createObjectURL(
          new Blob([kubeconfig], { type: "application/yaml;charset=utf-8" }),
        );
        const link = document.createElement("a");
        const filename =
          cluster.name.replace(/[^a-zA-Z0-9_.-]+/g, "-") || "kubernetes";
        link.href = url;
        link.download = `${filename}-kubeconfig.yaml`;
        link.click();
        URL.revokeObjectURL(url);
        setDialog(null);
      } catch (cause) {
        console.error("[magnum/kubeconfig] credential download failed", cause);
        setError(
          cause instanceof Error
            ? cause.message
            : "Kubernetes credentials could not be generated.",
        );
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={!scopeReady || isPending} size="sm" variant="outline">
            Actions
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            disabled={!ready || !cluster.api_address}
            onClick={() => openDialog("access")}
          >
            <Download className="size-4" />
            Download kubeconfig
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <RotateCw className="size-4" />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span>Rotate CA credentials</span>
              <span className="text-xs text-muted-foreground">
                Not supported
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!ready || !nodeGroups.length}
            onClick={() => openDialog("resize")}
          >
            <Scaling className="size-4" />
            Scale node group
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready || !upgradeTemplates.length}
            onClick={() => openDialog("upgrade")}
          >
            <Upload className="size-4" />
            Upgrade Kubernetes
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!scopeReady || deletionStarted}
            variant="destructive"
            onClick={() => openDialog("delete")}
          >
            <Trash2 className="size-4" />
            Delete cluster
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog === "access"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Download kubeconfig
            </DialogTitle>
            <DialogDescription>
              Download a kubeconfig for {cluster.name}. Sunrise creates its
              private key in this browser and asks Magnum to sign the matching
              client certificate. Existing kubeconfigs and cluster CA
              credentials are not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">Kubernetes API</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {cluster.api_address ?? "No API endpoint reported"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            The certificate uses Magnum&apos;s standard Kubernetes administrator
            identity and should be protected like a password.
          </p>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={closeDialog}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || !cluster.api_address}
              onClick={downloadKubeconfig}
              type="button"
            >
              <Download className="size-4" />
              {isPending ? "Preparing kubeconfig" : "Download kubeconfig"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "resize"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedUsesAutoscaler
                ? "Adjust node-group autoscaling"
                : "Resize node group"}
            </DialogTitle>
            <DialogDescription>
              {selectedUsesAutoscaler
                ? "Cluster Autoscaler controls desired worker capacity. Set this node group's minimum and maximum."
                : "Change desired capacity. Magnum applies worker bounds and requires an odd control-plane size."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Node group</Label>
              <Select
                value={nodeGroupName}
                onValueChange={(value) => {
                  const next = nodeGroups.find(
                    (nodeGroup) => nodeGroup.name === value,
                  );
                  setNodeGroupName(value);
                  setNodeCount(String(next?.node_count ?? 0));
                  setMinNodeCount(String(next?.min_node_count ?? 0));
                  setMaxNodeCount(next ? String(autoscalerMaximum(next)) : "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodeGroups.map((nodeGroup) => (
                    <SelectItem key={nodeGroup.uuid} value={nodeGroup.name}>
                      {nodeGroup.name} · {nodeGroup.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedUsesAutoscaler ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Minimum nodes</Label>
                  <Input
                    max={10000}
                    min={0}
                    type="number"
                    value={minNodeCount}
                    onChange={(event) => setMinNodeCount(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Maximum nodes</Label>
                  <Input
                    min={Number(minNodeCount) || 0}
                    max={10000}
                    type="number"
                    value={maxNodeCount}
                    onChange={(event) => setMaxNodeCount(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Current capacity is {selectedNodeGroup?.node_count ?? 0}.
                  Magnum first records a compatible desired count so it can
                  accept the new boundaries. Cluster Autoscaler then reconciles
                  actual instances. Scale-down may require the default
                  10-minute delay after a node is added, followed by 10 minutes
                  of unneeded time before Cluster Autoscaler removes it.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Desired nodes</Label>
                <Input
                  min={
                    selectedNodeGroup?.role === "master"
                      ? 1
                      : (selectedNodeGroup?.min_node_count ?? 0)
                  }
                  max={selectedNodeGroup?.max_node_count ?? 10000}
                  step={selectedNodeGroup?.role === "master" ? 2 : 1}
                  type="number"
                  value={nodeCount}
                  onChange={(event) => setNodeCount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Current {selectedNodeGroup?.node_count ?? 0}
                  {selectedNodeGroup?.role === "master"
                    ? " · odd sizes only"
                    : ` · allowed ${selectedNodeGroup?.min_node_count ?? 0}–${selectedNodeGroup ? autoscalerMaximum(selectedNodeGroup) : "-"}`}
                </p>
              </div>
            )}
            {error ? <MutationAlert>{error}</MutationAlert> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={closeDialog}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                isPending ||
                (selectedUsesAutoscaler
                  ? !minNodeCount ||
                    !maxNodeCount ||
                    Number(minNodeCount) > Number(maxNodeCount)
                  : !nodeCount)
              }
              onClick={scale}
              type="button"
            >
              {isPending
                ? selectedUsesAutoscaler
                  ? "Reconciling capacity"
                  : "Starting resize"
                : selectedUsesAutoscaler
                  ? "Update bounds"
                  : "Resize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "upgrade"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade Kubernetes cluster</DialogTitle>
            <DialogDescription>
              Magnum Cluster API upgrades the control plane and every worker
              group using the same image.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Target cluster template</Label>
              <Select
                value={upgradeTemplateId}
                onValueChange={setUpgradeTemplateId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an upgrade template" />
                </SelectTrigger>
                <SelectContent>
                  {upgradeTemplates.map((template) => (
                    <SelectItem key={template.uuid} value={template.uuid}>
                      {template.name} · {templateVersion(template)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Maximum parallel nodes</Label>
              <Input
                min={1}
                max={10000}
                type="number"
                value={maxBatchSize}
                onChange={(event) => setMaxBatchSize(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use 1 for the most conservative rolling upgrade.
              </p>
            </div>
            {error ? <MutationAlert>{error}</MutationAlert> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={closeDialog}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || !upgradeTemplateId}
              onClick={upgrade}
              type="button"
            >
              {isPending ? "Starting upgrade" : "Start cluster-wide upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        confirmLabel="Delete cluster"
        confirmDisabled={deleteConfirmation !== cluster.name}
        description="This permanently removes the cluster and its Magnum-managed infrastructure. Workloads and data stored only inside the cluster will be lost."
        error={error}
        onConfirm={remove}
        onOpenChange={(open) => !open && closeDialog()}
        open={dialog === "delete"}
        pending={isPending}
        pendingLabel="Starting deletion"
        title={`Delete ${cluster.name}?`}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="cluster-delete-confirmation">
            Enter <span className="font-mono">{cluster.name}</span> to confirm
          </Label>
          <Input
            autoComplete="off"
            id="cluster-delete-confirmation"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
          />
          {deleteConfirmation && deleteConfirmation !== cluster.name ? (
            <p className="text-xs text-destructive">
              Cluster name does not match.
            </p>
          ) : null}
        </div>
        {deleteConfirmation !== cluster.name ? (
          <p className="text-xs text-muted-foreground">
            Confirmation is required before deletion.
          </p>
        ) : null}
      </MutationConfirmationDialog>
    </>
  );
}
