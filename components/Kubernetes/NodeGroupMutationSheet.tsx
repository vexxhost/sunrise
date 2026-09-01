"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { AvailabilityZoneSelect } from "@/components/Kubernetes/AvailabilityZoneSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatFlavorCapacity } from "@/lib/openstack/flavor";
import { serverAvailabilityZonesQueryOptions } from "@/hooks/queries/useServers";
import {
  createClusterNodeGroupAction,
  updateClusterNodeGroupAction,
} from "@/lib/openstack/magnum-actions";
import type {
  Flavor,
  MagnumCluster,
  MagnumClusterNodeGroup,
} from "@/types/openstack";

const INHERIT = "cluster-default";

function labelEnabled(value?: string) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

interface NodeGroupMutationSheetProps {
  cluster: MagnumCluster;
  flavors: Flavor[];
  nodeGroup?: MagnumClusterNodeGroup;
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
}

function Field({
  children,
  description,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function NodeGroupMutationSheet({
  cluster,
  flavors,
  nodeGroup,
  onComplete,
  onOpenChange,
  open,
  projectId,
  regionId,
}: NodeGroupMutationSheetProps) {
  const editing = Boolean(nodeGroup);
  const usesAutoscaler =
    labelEnabled(cluster.labels?.auto_scaling_enabled) &&
    nodeGroup?.role !== "master";
  const queryClient = useQueryClient();
  const [name, setName] = useState(nodeGroup?.name ?? "");
  const [role, setRole] = useState(nodeGroup?.role ?? "worker");
  const [nodeCount, setNodeCount] = useState(
    String(nodeGroup?.node_count ?? 1),
  );
  const [minNodeCount, setMinNodeCount] = useState(
    String(nodeGroup?.min_node_count ?? 0),
  );
  const [maxNodeCount, setMaxNodeCount] = useState(
    String(nodeGroup?.max_node_count ?? (nodeGroup?.min_node_count ?? 0) + 1),
  );
  const [flavorId, setFlavorId] = useState(nodeGroup?.flavor_id ?? INHERIT);
  const [availabilityZone, setAvailabilityZone] = useState(
    nodeGroup?.labels?.availability_zone ?? "",
  );
  const [serverGroupPolicies, setServerGroupPolicies] = useState(
    nodeGroup?.labels?.server_group_policies ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const availabilityZones = useQuery({
    ...serverAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId) && !editing,
  });

  const close = () => {
    if (isPending) return;
    setError(null);
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId) {
      setError("Select a project and region before changing node groups.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const scope = { projectId, regionId };
      const common = {
        autoScalingEnabled: usesAutoscaler,
        minNodeCount: Number(minNodeCount),
        maxNodeCount: Number(maxNodeCount),
      };
      const result = nodeGroup
        ? await updateClusterNodeGroupAction(
            scope,
            cluster.uuid,
            nodeGroup,
            common,
          )
        : await createClusterNodeGroupAction(scope, cluster.uuid, {
            ...common,
            name,
            role,
            nodeCount: usesAutoscaler
              ? Number(minNodeCount)
              : Number(nodeCount),
            flavorId: flavorId === INHERIT ? undefined : flavorId,
            availabilityZone: availabilityZone || undefined,
            serverGroupPolicies: serverGroupPolicies || undefined,
          });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "magnum"],
      });
      onOpenChange(false);
      await onComplete();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-3xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetHeader className="border-b pr-12">
            <SheetTitle>
              {editing ? `Edit ${nodeGroup?.name}` : "Add node group"}
            </SheetTitle>
            <SheetDescription>
              {editing
                ? usesAutoscaler
                  ? "Change the Cluster Autoscaler boundaries supported by the deployed Magnum and CAPI driver."
                  : "Change manual resize limits. If the current count falls outside the new range, Magnum moves it to the nearest boundary."
                : "Add an independently scalable worker pool to this Kubernetes cluster."}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
            <div className="space-y-6">
              <Field
                label="Name"
                description={
                  editing
                    ? "Magnum does not allow node-group names to change."
                    : "Use a lowercase RFC 1123 name."
                }
              >
                <Input
                  disabled={editing}
                  maxLength={253}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field
                label="Role"
                description={
                  editing
                    ? "Magnum does not allow a node-group role to change after creation."
                    : "One RFC 1123 role becomes the Kubernetes node-role label for this pool."
                }
              >
                <Input
                  disabled={editing}
                  maxLength={63}
                  required
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                />
              </Field>
              {editing ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  Current desired capacity:{" "}
                  <span className="font-semibold">{nodeGroup?.node_count}</span>
                  . Use <span className="font-medium">Resize</span> in the table
                  Actions menu to change it.
                </div>
              ) : usesAutoscaler ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Cluster Autoscaler chooses the initial desired capacity from
                  the range below. Magnum records the minimum as this node
                  group&apos;s initial count.
                </div>
              ) : (
                <Field
                  label="Initial nodes"
                  description="Desired capacity created for this manually scaled node group."
                >
                  <Input
                    min={0}
                    max={10000}
                    type="number"
                    value={nodeCount}
                    onChange={(event) => setNodeCount(event.target.value)}
                  />
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minimum nodes"
                  description={
                    usesAutoscaler
                      ? "Lower autoscaler boundary."
                      : "Lower limit for manual resize operations."
                  }
                >
                  <Input
                    min={0}
                    max={10000}
                    type="number"
                    value={minNodeCount}
                    onChange={(event) => setMinNodeCount(event.target.value)}
                  />
                </Field>
                <Field
                  label="Maximum nodes"
                  description={
                    usesAutoscaler
                      ? "Upper autoscaler boundary. The current driver does not support an unbounded maximum."
                      : "Upper limit for manual resize operations. The current driver does not support an unbounded maximum."
                  }
                >
                  <Input
                    min={0}
                    max={10000}
                    required
                    type="number"
                    value={maxNodeCount}
                    onChange={(event) => setMaxNodeCount(event.target.value)}
                  />
                </Field>
              </div>
              {usesAutoscaler ? (
                <p className="text-xs text-muted-foreground">
                  Scale-down may require the default 10-minute delay after a
                  node is added, followed by 10 minutes of unneeded time before
                  Cluster Autoscaler removes it.
                </p>
              ) : null}
              {!editing ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Flavor">
                      <Select value={flavorId} onValueChange={setFlavorId}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Cluster default
                          </SelectItem>
                          {flavors.map((flavor) => (
                            <SelectItem
                              key={flavor.id}
                              value={String(flavor.id)}
                            >
                              {formatFlavorCapacity(flavor)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Node image"
                      description="Per-group images are not supported by the current CAPI driver. New groups use the cluster template image; a cluster upgrade moves every node group to the new template image."
                    >
                      <Select disabled value={INHERIT}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Cluster template image
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Availability zone"
                      description="Leave empty to inherit the cluster placement."
                    >
                      <AvailabilityZoneSelect
                        defaultLabel="Cluster default"
                        onValueChange={setAvailabilityZone}
                        value={availabilityZone}
                        zones={(availabilityZones.data ?? []).map(
                          (zone) => zone.zoneName,
                        )}
                      />
                    </Field>
                    <Field
                      label="Server group policies"
                      description="Comma-separated Nova policies."
                    >
                      <Input
                        placeholder="soft-anti-affinity"
                        value={serverGroupPolicies}
                        onChange={(event) =>
                          setServerGroupPolicies(event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              ) : null}
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="font-medium">
                  Kubernetes labels and taints unavailable
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The deployed Magnum API and pinned CAPI driver do not apply
                  per-group kubelet labels or taints. Sunrise will expose these
                  controls when both services support them.
                </p>
              </div>
            </div>
          </div>
          {error ? (
            <div className="px-4 pb-4">
              <MutationAlert>{error}</MutationAlert>
            </div>
          ) : null}
          <SheetFooter className="border-t bg-background sm:flex-row sm:justify-end">
            <Button
              disabled={isPending}
              onClick={close}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                isPending ||
                !name ||
                !role ||
                minNodeCount === "" ||
                maxNodeCount === "" ||
                Number(minNodeCount) > Number(maxNodeCount)
              }
              type="submit"
            >
              {isPending
                ? "Submitting"
                : editing
                  ? "Save settings"
                  : "Add node group"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
