'use client';

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, useSuspenseQuery } from "@/lib/tanstack";
import type { ColumnDef } from "@/lib/tanstack-table";
import {
  clusterTemplatesQueryOptions,
  clustersQueryOptions,
  createClusterMutationOptions,
  deleteClusterMutationOptions,
  resizeClusterMutationOptions,
  rotateClusterCaMutationOptions,
  rotateClusterCertificatesMutationOptions,
  upgradeClusterMutationOptions,
} from "@/hooks/queries/useMagnum";
import type { MagnumCluster, MagnumClusterTemplate } from "@/types/openstack";
import { DataTable, DataTableRowAction } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import type { CheckedState } from "@/lib/radix";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarClock,
  Layers,
  Orbit,
  Plus,
  SlidersHorizontal,
  ArrowUpCircle,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { parseLabelInput } from "@/app/kubernetes/utils/labels";

interface ClustersClientProps {
  regionId?: string;
  projectId?: string;
  onCreate?: () => void;
}

function statusToVariant(status: string) {
  if (status.endsWith("IN_PROGRESS")) {
    return "outline" as const;
  }
  if (status.endsWith("FAILED")) {
    return "destructive" as const;
  }
  if (status.endsWith("COMPLETE")) {
    return "default" as const;
  }
  return "secondary" as const;
}

interface CreateClusterFormState {
  name: string;
  templateId: string;
  masterCount: string;
  nodeCount: string;
  keypair: string;
  fixedNetwork: string;
  fixedSubnet: string;
  floatingIpEnabled: boolean;
  labels: string;
}

const INITIAL_CREATE_FORM: CreateClusterFormState = {
  name: "",
  templateId: "",
  masterCount: "1",
  nodeCount: "1",
  keypair: "",
  fixedNetwork: "",
  fixedSubnet: "",
  floatingIpEnabled: true,
  labels: "",
};

interface ToastState {
  id: number;
  type: "success" | "error";
  message: string;
}

const baseColumns = (
  templateMap: Record<string, MagnumClusterTemplate | undefined>,
): ColumnDef<MagnumCluster>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: { row: { original: MagnumCluster } }) => (
      <Link href={`/kubernetes/clusters/${row.original.uuid}`} className="text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: { original: MagnumCluster } }) => (
      <div className="flex items-center gap-2">
        <Badge variant={statusToVariant(row.original.status)}>
          {row.original.status.replace(/_/g, " ")}
        </Badge>
        {row.original.health_status && (
          <Badge variant={row.original.health_status === "HEALTHY" ? "default" : "destructive"}>
            {row.original.health_status}
          </Badge>
        )}
      </div>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "node_count",
    header: "Nodes",
    cell: ({ row }: { row: { original: MagnumCluster } }) => (
      <span className="font-medium">
        {row.original.master_count} control / {row.original.node_count} worker
      </span>
    ),
    meta: { fieldType: "number", visible: true },
  },
  {
    accessorKey: "cluster_template_id",
    header: "Template",
    cell: ({ row }: { row: { original: MagnumCluster } }) => {
      const template = templateMap[row.original.cluster_template_id];
      return template ? template.name : row.original.cluster_template_id;
    },
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "coe_version",
    header: "Version",
    cell: ({ row }: { row: { original: MagnumCluster } }) =>
      row.original.coe_version ? `${row.original.coe_version} / ${row.original.container_version ?? "-"}` : "-",
    meta: { fieldType: "string", visible: false },
  },
  {
    accessorKey: "api_address",
    header: "API Address",
    cell: ({ row }: { row: { original: MagnumCluster } }) =>
      row.original.api_address ? (
        <a href={row.original.api_address} className="text-primary hover:underline" target="_blank" rel="noreferrer">
          {row.original.api_address}
        </a>
      ) : (
        "-"
      ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }: { row: { original: MagnumCluster } }) =>
      row.original.created_at
        ? `${formatDistanceToNow(parseISO(row.original.created_at), { addSuffix: true })}`
        : "-",
    meta: { fieldType: "date", visible: true },
  },
];

export function ClustersClient({ regionId, projectId, onCreate }: ClustersClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: clusters, isRefetching, refetch } = useSuspenseQuery(
    clustersQueryOptions(regionId, projectId),
  );
  const { data: templates } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );
  const createCluster = useMutation(createClusterMutationOptions(regionId));
  const resizeCluster = useMutation(resizeClusterMutationOptions(regionId));
  const upgradeCluster = useMutation(upgradeClusterMutationOptions(regionId));
  const rotateCa = useMutation(rotateClusterCaMutationOptions(regionId));
  const rotateCerts = useMutation(rotateClusterCertificatesMutationOptions(regionId));
  const deleteCluster = useMutation(deleteClusterMutationOptions(regionId));

  const [toast, setToast] = useState<ToastState | null>(null);
  const pushToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(
      () => setToast((current) => (current?.id === toast.id ? null : current)),
      4000,
    );
    return () => clearTimeout(timeout);
  }, [toast]);

  const invalidateClusters = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "magnum", "clusters"],
    });
  }, [projectId, queryClient, regionId]);

  const invalidateClusterDetail = useCallback(
    async (uuid: string) => {
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "magnum", "cluster", uuid],
        exact: false,
      });
    },
    [projectId, queryClient, regionId],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createForm, setCreateForm] = useState<CreateClusterFormState>(INITIAL_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [scaleTarget, setScaleTarget] = useState<MagnumCluster | null>(null);
  const [scaleCount, setScaleCount] = useState<string>("");
  const [scaleError, setScaleError] = useState<string | null>(null);

  const [upgradeTarget, setUpgradeTarget] = useState<MagnumCluster | null>(null);
  const [upgradeTemplateId, setUpgradeTemplateId] = useState<string>("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [rotateTarget, setRotateTarget] = useState<{ cluster: MagnumCluster; mode: "ca" | "certs" } | null>(null);

  const [deleteTargets, setDeleteTargets] = useState<MagnumCluster[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const templateMap = useMemo(() => {
    const map: Record<string, MagnumClusterTemplate> = {};
    templates.forEach((template: MagnumClusterTemplate) => {
      map[template.uuid] = template;
    });
    return map;
  }, [templates]);

  const columns = useMemo(() => baseColumns(templateMap), [templateMap]);

  const wizardSteps = ["Basics", "Sizing", "Networking"] as const;

  const renderCreateStep = () => {
    if (createStep === 0) {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cluster-name">Cluster name</Label>
            <Input
              id="cluster-name"
              value={createForm.name}
              onChange={(event) => setCreateForm((state) => ({ ...state, name: event.target.value }))}
              placeholder="prod-k8s-cluster"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cluster-template">Template</Label>
            <select
              id="cluster-template"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={createForm.templateId}
              onChange={(event) => setCreateForm((state) => ({ ...state, templateId: event.target.value }))}
              required
            >
              <option value="">Select a template</option>
              {templates.map((template: MagnumClusterTemplate) => (
                <option key={template.uuid} value={template.uuid}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (createStep === 1) {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="master-count">Control nodes</Label>
            <Input
              id="master-count"
              value={createForm.masterCount}
              onChange={(event) => setCreateForm((state) => ({ ...state, masterCount: event.target.value }))}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker-count">Worker nodes</Label>
            <Input
              id="worker-count"
              value={createForm.nodeCount}
              onChange={(event) => setCreateForm((state) => ({ ...state, nodeCount: event.target.value }))}
              placeholder="3"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cluster-keypair">Keypair (optional)</Label>
            <Input
              id="cluster-keypair"
              value={createForm.keypair}
              onChange={(event) => setCreateForm((state) => ({ ...state, keypair: event.target.value }))}
              placeholder="ssh-keypair-name"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cluster-fixed-network">Fixed network ID</Label>
          <Input
            id="cluster-fixed-network"
            value={createForm.fixedNetwork}
            onChange={(event) => setCreateForm((state) => ({ ...state, fixedNetwork: event.target.value }))}
            placeholder="optional network UUID"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cluster-fixed-subnet">Fixed subnet ID</Label>
          <Input
            id="cluster-fixed-subnet"
            value={createForm.fixedSubnet}
            onChange={(event) => setCreateForm((state) => ({ ...state, fixedSubnet: event.target.value }))}
            placeholder="optional subnet UUID"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={createForm.floatingIpEnabled}
            onCheckedChange={(checked: CheckedState) =>
              setCreateForm((state) => ({ ...state, floatingIpEnabled: checked === true }))
            }
          />
          Allocate floating IP for API endpoints
        </label>
        <div className="space-y-2">
          <Label htmlFor="cluster-labels">Labels (JSON)</Label>
          <Textarea
            id="cluster-labels"
            value={createForm.labels}
            onChange={(event) => setCreateForm((state) => ({ ...state, labels: event.target.value }))}
            placeholder='{"kube_tag": "v1.29.3"}'
            rows={3}
          />
        </div>
      </div>
    );
  };

  const handleCreateNext = () => {
    setFormError(null);
    if (createStep === 0) {
      if (!createForm.templateId) {
        setFormError("Select a cluster template.");
        return;
      }
      if (!createForm.name.trim()) {
        setFormError("Cluster name is required.");
        return;
      }
    }
    if (createStep === 1) {
      const masterCount = Number(createForm.masterCount);
      const nodeCount = Number(createForm.nodeCount);
      if (Number.isNaN(masterCount) || masterCount <= 0) {
        setFormError("Control node count must be a positive number.");
        return;
      }
      if (Number.isNaN(nodeCount) || nodeCount < 0) {
        setFormError("Worker node count must be zero or more.");
        return;
      }
    }
    setCreateStep((step) => Math.min(step + 1, wizardSteps.length - 1));
  };

  const handleCreateBack = () => {
    setFormError(null);
    setCreateStep((step) => Math.max(step - 1, 0));
  };

  const resetCreateDialog = () => {
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateStep(0);
    setFormError(null);
  };

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const masterCount = Number(createForm.masterCount);
    const nodeCount = Number(createForm.nodeCount);

    if (Number.isNaN(masterCount) || masterCount <= 0) {
      setFormError("Control node count must be a positive number.");
      return;
    }
    if (Number.isNaN(nodeCount) || nodeCount < 0) {
      setFormError("Worker node count must be zero or more.");
      return;
    }
    if (!createForm.templateId) {
      setFormError("Select a cluster template.");
      return;
    }

    const labels = parseLabelInput(createForm.labels);
    if (labels === null) {
      setFormError("Labels must be a valid JSON object.");
      return;
    }

    try {
      await createCluster.mutateAsync({
        name: createForm.name.trim(),
        cluster_template_id: createForm.templateId,
        master_count: masterCount,
        node_count: nodeCount,
        keypair: createForm.keypair.trim() || undefined,
        fixed_network: createForm.fixedNetwork.trim() || undefined,
        fixed_subnet: createForm.fixedSubnet.trim() || undefined,
        floating_ip_enabled: createForm.floatingIpEnabled,
        labels,
      });
      await invalidateClusters();
      pushToast("success", `Cluster "${createForm.name}" creation requested.`);
      setCreateOpen(false);
      resetCreateDialog();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to submit cluster creation.");
    }
  };

  const handleScaleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scaleTarget) {
      return;
    }
    setScaleError(null);

    const desiredCount = Number(scaleCount);
    if (Number.isNaN(desiredCount) || desiredCount < 0) {
      setScaleError("Provide a valid non-negative worker count.");
      return;
    }

    try {
      await resizeCluster.mutateAsync({ uuid: scaleTarget.uuid, payload: { node_count: desiredCount } });
      await invalidateClusters();
      await invalidateClusterDetail(scaleTarget.uuid);
      pushToast("success", `Scaling requested for "${scaleTarget.name}".`);
      setScaleTarget(null);
    } catch (error) {
      setScaleError(error instanceof Error ? error.message : "Failed to scale cluster.");
    }
  };

  const handleUpgradeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!upgradeTarget) {
      return;
    }
    setUpgradeError(null);

    if (!upgradeTemplateId) {
      setUpgradeError("Choose a target template.");
      return;
    }

    try {
      await upgradeCluster.mutateAsync({
        uuid: upgradeTarget.uuid,
        payload: { cluster_template_id: upgradeTemplateId },
      });
      await invalidateClusters();
      await invalidateClusterDetail(upgradeTarget.uuid);
      pushToast("success", `Upgrade requested for "${upgradeTarget.name}".`);
      setUpgradeTarget(null);
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : "Failed to upgrade cluster.");
    }
  };

  const handleRotateSubmit = async () => {
    if (!rotateTarget) {
      return;
    }
    const { cluster, mode } = rotateTarget;
    try {
      if (mode === "ca") {
        await rotateCa.mutateAsync(cluster.uuid);
      } else {
        await rotateCerts.mutateAsync(cluster.uuid);
      }
      await invalidateClusters();
      await invalidateClusterDetail(cluster.uuid);
      pushToast("success", `Certificate rotation requested for "${cluster.name}".`);
      setRotateTarget(null);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to rotate certificates.");
    }
  };

  const handleDeleteClusters = async () => {
    if (!deleteTargets.length) {
      return;
    }
    setDeleteError(null);

    try {
      await Promise.all(
        deleteTargets.map(async (cluster) => {
          await deleteCluster.mutateAsync(cluster.uuid);
          await invalidateClusterDetail(cluster.uuid);
        }),
      );
      await invalidateClusters();
      pushToast(
        "success",
        deleteTargets.length === 1
          ? `Cluster "${deleteTargets[0].name}" deletion requested.`
          : `${deleteTargets.length} clusters scheduled for deletion.`,
      );
      setDeleteTargets([]);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete clusters.");
    }
  };

  const rowActions: DataTableRowAction<MagnumCluster>[] = useMemo(
    () => [
      {
        label: "Scale",
        icon: SlidersHorizontal,
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          const target = rows[0];
          setScaleTarget(target);
          setScaleCount(String(target.node_count ?? 0));
          setScaleError(null);
        },
      },
      {
        label: "Upgrade",
        icon: ArrowUpCircle,
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          const target = rows[0];
          setUpgradeTarget(target);
          setUpgradeTemplateId(target.cluster_template_id);
          setUpgradeError(null);
        },
      },
      {
        label: "Rotate CA",
        icon: ShieldAlert,
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          setRotateTarget({ cluster: rows[0], mode: "ca" });
        },
      },
      {
        label: "Rotate certificates",
        icon: ShieldCheck,
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          setRotateTarget({ cluster: rows[0], mode: "certs" });
        },
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive",
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          setDeleteTargets(rows);
          setDeleteError(null);
        },
      },
      {
        label: "View details",
        onClick: (rows: MagnumCluster[]) => {
          if (!rows.length) {
            return;
          }
          router.push(`/kubernetes/clusters/${rows[0].uuid}`);
        },
        icon: Orbit,
      },
    ],
    [router],
  );

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`flex items-center gap-3 rounded-md border px-4 py-3 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                : "border-red-500 bg-red-500/10 text-red-600"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clusters</h1>
          <p className="text-sm text-muted-foreground">
            Monitor Magnum cluster health, capacity, and control plane access.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateOpen(true);
            onCreate?.();
          }}
          className="gap-2 self-start"
        >
          <Plus className="h-4 w-4" />
          Create Cluster
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <Layers className="h-6 w-6 text-primary" />
          <div>
            <p className="text-xs uppercase text-muted-foreground">Total Clusters</p>
            <p className="text-lg font-semibold">{clusters.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <Orbit className="h-6 w-6 text-primary" />
          <div>
            <p className="text-xs uppercase text-muted-foreground">Control Nodes</p>
            <p className="text-lg font-semibold">
              {clusters.reduce(
                (total: number, cluster: MagnumCluster) => total + (cluster.master_count ?? 0),
                0,
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <CalendarClock className="h-6 w-6 text-primary" />
          <div>
            <p className="text-xs uppercase text-muted-foreground">Worker Nodes</p>
            <p className="text-lg font-semibold">
              {clusters.reduce(
                (total: number, cluster: MagnumCluster) => total + (cluster.node_count ?? 0),
                0,
              )}
            </p>
          </div>
        </div>
      </div>

      <DataTable
        data={clusters}
        columns={columns}
        resourceName="cluster"
        emptyIcon={Layers}
        isRefetching={isRefetching}
        refetch={refetch}
        rowActions={rowActions}
      />

      <Dialog
        open={createOpen}
        onOpenChange={(open: boolean) => {
          setCreateOpen(open);
          if (!open) {
            resetCreateDialog();
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Launch cluster</DialogTitle>
            <DialogDescription>
              Provide the basics, sizing, and networking inputs to request a new Magnum cluster.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="flex flex-wrap gap-2 text-sm">
              {wizardSteps.map((label, index) => (
                <span
                  key={label}
                  className={`rounded-full px-3 py-1 ${
                    index === createStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index + 1}. {label}
                </span>
              ))}
            </div>

            {renderCreateStep()}

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {formError}
              </div>
            )}

            <DialogFooter className="justify-between">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                {createStep > 0 && (
                  <Button type="button" variant="outline" onClick={handleCreateBack}>
                    Back
                  </Button>
                )}
              </div>
              {createStep < wizardSteps.length - 1 ? (
                <Button type="button" onClick={handleCreateNext}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={createCluster.isPending}>
                  {createCluster.isPending ? "Submitting..." : "Create cluster"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!scaleTarget}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setScaleTarget(null);
            setScaleError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale cluster</DialogTitle>
            <DialogDescription>
              Adjust the worker node count for {scaleTarget?.name}. Magnum will reconcile the change.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScaleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scale-count">Worker node count</Label>
              <Input
                id="scale-count"
                value={scaleCount}
                onChange={(event) => setScaleCount(event.target.value)}
                placeholder="3"
              />
            </div>
            {scaleError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {scaleError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScaleTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resizeCluster.isPending}>
                {resizeCluster.isPending ? "Scaling..." : "Apply"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!upgradeTarget}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setUpgradeTarget(null);
            setUpgradeError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade cluster</DialogTitle>
            <DialogDescription>
              Reconcile {upgradeTarget?.name} with an updated cluster template or software version.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpgradeSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upgrade-template">Target template</Label>
              <select
                id="upgrade-template"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={upgradeTemplateId}
                onChange={(event) => setUpgradeTemplateId(event.target.value)}
              >
                <option value="">Select a template</option>
                {templates.map((template: MagnumClusterTemplate) => (
                  <option key={template.uuid} value={template.uuid}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            {upgradeError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {upgradeError}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUpgradeTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={upgradeCluster.isPending}>
                {upgradeCluster.isPending ? "Scheduling..." : "Upgrade"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rotateTarget}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRotateTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rotate {rotateTarget?.mode === "ca" ? "cluster CA" : "API certificates"}
            </DialogTitle>
            <DialogDescription>
              Issue a new {rotateTarget?.mode === "ca" ? "certificate authority chain" : "TLS certificate"} for{" "}
              {rotateTarget?.cluster.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRotateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRotateSubmit} disabled={rotateCa.isPending || rotateCerts.isPending}>
              {rotateCa.isPending || rotateCerts.isPending ? "Submitting..." : "Rotate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTargets.length > 0}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteTargets([]);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete cluster{deleteTargets.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Magnum will delete the selected cluster resources. This operation cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {deleteTargets.map((cluster) => (
                <li key={cluster.uuid}>
                  <span className="font-medium">{cluster.name}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">({cluster.uuid})</span>
                </li>
              ))}
            </ul>
            {deleteError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {deleteError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTargets([])}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClusters}
              disabled={deleteCluster.isPending}
            >
              {deleteCluster.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

