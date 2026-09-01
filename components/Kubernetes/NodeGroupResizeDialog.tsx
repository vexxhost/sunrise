"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resizeClusterAction,
  updateClusterNodeGroupAction,
} from "@/lib/openstack/magnum-actions";
import { clusterNodeGroupsQueryOptions } from "@/hooks/queries/useMagnum";
import type { MagnumCluster, MagnumClusterNodeGroup } from "@/types/openstack";

interface NodeGroupResizeDialogProps {
  autoScalingEnabled: boolean;
  cluster: MagnumCluster;
  nodeGroup: MagnumClusterNodeGroup;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
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

export function NodeGroupResizeDialog({
  autoScalingEnabled,
  cluster,
  nodeGroup,
  onOpenChange,
  open,
  projectId,
  regionId,
}: NodeGroupResizeDialogProps) {
  const queryClient = useQueryClient();
  const currentMaximum = autoscalerMaximum(nodeGroup);
  const [nodeCount, setNodeCount] = useState(String(nodeGroup.node_count));
  const [minNodeCount, setMinNodeCount] = useState(
    String(nodeGroup.min_node_count ?? 0),
  );
  const [maxNodeCount, setMaxNodeCount] = useState(String(currentMaximum));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const usesAutoscaler = autoScalingEnabled && nodeGroup.role !== "master";

  const scale = () => {
    if (!projectId || !regionId) return;
    startTransition(async () => {
      setError(null);
      const scope = { projectId, regionId };
      const requestedMinimum = Number(minNodeCount);
      const requestedMaximum = Number(maxNodeCount);
      const result = usesAutoscaler
        ? await updateClusterNodeGroupAction(scope, cluster.uuid, nodeGroup, {
            minNodeCount: requestedMinimum,
            maxNodeCount: requestedMaximum,
          })
        : await resizeClusterAction(scope, cluster.uuid, {
            autoScalingEnabled,
            nodeGroup: nodeGroup.name,
            nodeCount: Number(nodeCount),
            role: nodeGroup.role,
            minNodeCount: nodeGroup.min_node_count,
            maxNodeCount: nodeGroup.max_node_count,
          });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      queryClient.setQueryData<MagnumClusterNodeGroup[]>(
        clusterNodeGroupsQueryOptions(regionId, projectId, cluster.uuid)
          .queryKey,
        (current) =>
          current?.map((candidate) =>
            candidate.uuid === nodeGroup.uuid
              ? {
                  ...candidate,
                  status: "UPDATE_IN_PROGRESS",
                  ...(usesAutoscaler
                    ? {
                        min_node_count: requestedMinimum,
                        max_node_count: requestedMaximum,
                      }
                    : { node_count: Number(nodeCount) }),
                }
              : candidate,
          ),
      );
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {usesAutoscaler ? "Adjust autoscaling" : "Resize"} {nodeGroup.name}
          </DialogTitle>
          <DialogDescription>
            {usesAutoscaler
              ? "Set the capacity range for this worker group. Cluster Autoscaler chooses the desired node count within these boundaries."
              : `Set desired capacity for this ${nodeGroup.role} node group.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {usesAutoscaler ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Minimum nodes</Label>
                <Input
                  autoFocus
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
                Current capacity is {nodeGroup.node_count}. Magnum first records
                a compatible desired count so it can accept the new boundaries.
                Cluster Autoscaler then reconciles actual instances. Scale-down
                may require the default 10-minute delay after a node is added,
                followed by 10 minutes of unneeded time before Cluster
                Autoscaler removes it.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Desired nodes</Label>
              <Input
                autoFocus
                min={
                  nodeGroup.role === "master"
                    ? 1
                    : (nodeGroup.min_node_count ?? 0)
                }
                max={nodeGroup.max_node_count ?? 10000}
                step={nodeGroup.role === "master" ? 2 : 1}
                type="number"
                value={nodeCount}
                onChange={(event) => setNodeCount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Current {nodeGroup.node_count}
                {nodeGroup.role === "master"
                  ? " · control-plane sizes must be odd"
                  : ` · allowed ${nodeGroup.min_node_count ?? 0}–${autoscalerMaximum(nodeGroup)}`}
              </p>
            </div>
          )}
          {error ? <MutationAlert>{error}</MutationAlert> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              isPending ||
              (usesAutoscaler
                ? !minNodeCount ||
                  !maxNodeCount ||
                  Number(minNodeCount) > Number(maxNodeCount) ||
                  (Number(minNodeCount) === (nodeGroup.min_node_count ?? 0) &&
                    Number(maxNodeCount) === currentMaximum)
                : !nodeCount || Number(nodeCount) === nodeGroup.node_count)
            }
            onClick={scale}
            type="button"
          >
            {isPending
              ? usesAutoscaler
                ? "Reconciling capacity"
                : "Starting resize"
              : usesAutoscaler
                ? "Update bounds"
                : "Resize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
