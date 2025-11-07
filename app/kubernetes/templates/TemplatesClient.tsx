'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@/lib/tanstack";
import type { ColumnDef } from "@/lib/tanstack-table";
import type { CheckedState } from "@/lib/radix";
import { parseLabelInput } from "@/app/kubernetes/utils/labels";
import { format } from "date-fns";
import {
  clusterTemplatesQueryOptions,
  createClusterTemplateMutationOptions,
  deleteClusterTemplateMutationOptions,
  updateClusterTemplateMutationOptions,
} from "@/hooks/queries/useMagnum";
import type { MagnumClusterTemplate, MagnumCOEType } from "@/types/openstack";
import { DataTable, DataTableRowAction } from "@/components/DataTable";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TemplatesClientProps {
  regionId?: string;
  projectId?: string;
}

interface TemplateFormState {
  name: string;
  coe: MagnumCOEType;
  image_id: string;
  flavor_id: string;
  master_flavor_id: string;
  keypair_id: string;
  external_network_id: string;
  fixed_network: string;
  fixed_subnet: string;
  dns_nameserver: string;
  docker_volume_size: string;
  public: boolean;
  registry_enabled: boolean;
  tls_disabled: boolean;
  floating_ip_enabled: boolean;
  labels: string;
  description: string;
}

const INITIAL_FORM_STATE: TemplateFormState = {
  name: "",
  coe: "kubernetes",
  image_id: "",
  flavor_id: "",
  master_flavor_id: "",
  keypair_id: "",
  external_network_id: "",
  fixed_network: "",
  fixed_subnet: "",
  dns_nameserver: "",
  docker_volume_size: "",
  public: false,
  registry_enabled: false,
  tls_disabled: false,
  floating_ip_enabled: true,
  labels: "",
  description: "",
};

interface ToastState {
  id: number;
  type: "success" | "error";
  message: string;
}

function buildCreatePayload(state: TemplateFormState) {
  const labels = parseLabelInput(state.labels);

  if (labels === null) {
    throw new Error("Labels must be a valid JSON object with string values.");
  }

  let dockerVolumeSize: number | undefined;
  if (state.docker_volume_size) {
    dockerVolumeSize = Number(state.docker_volume_size);
    if (Number.isNaN(dockerVolumeSize) || dockerVolumeSize <= 0) {
      throw new Error("Docker volume size must be a positive number.");
    }
  }

  return {
    name: state.name.trim(),
    coe: state.coe,
    image_id: state.image_id.trim(),
    flavor_id: state.flavor_id.trim() || undefined,
    master_flavor_id: state.master_flavor_id.trim() || undefined,
    keypair_id: state.keypair_id.trim() || undefined,
    external_network_id: state.external_network_id.trim() || undefined,
    fixed_network: state.fixed_network.trim() || undefined,
    fixed_subnet: state.fixed_subnet.trim() || undefined,
    dns_nameserver: state.dns_nameserver.trim() || undefined,
    docker_volume_size: dockerVolumeSize,
    public: state.public,
    registry_enabled: state.registry_enabled,
    tls_disabled: state.tls_disabled,
    floating_ip_enabled: state.floating_ip_enabled,
    labels,
    description: state.description.trim() || undefined,
  };
}

function buildUpdatePayload(state: TemplateFormState, original: MagnumClusterTemplate) {
  const normalizedState = buildCreatePayload(state);
  const originalRecord = original as unknown as Record<string, unknown>;
  const keys: Array<keyof typeof normalizedState> = [
    "name",
    "coe",
    "image_id",
    "flavor_id",
    "master_flavor_id",
    "keypair_id",
    "external_network_id",
    "fixed_network",
    "fixed_subnet",
    "dns_nameserver",
    "docker_volume_size",
    "public",
    "registry_enabled",
    "tls_disabled",
    "floating_ip_enabled",
    "labels",
    "description",
  ];

  const payload: Record<string, unknown> = {};

  keys.forEach((key) => {
    const value = normalizedState[key];
    const originalValue = originalRecord[key];

    const valuesAreEqual =
      typeof value === "object" && value !== null
        ? JSON.stringify(value) === JSON.stringify(originalValue ?? undefined)
        : value === (originalValue ?? undefined);

    if (!valuesAreEqual) {
      payload[key] = value;
    }
  });

  return payload;
}

function templateToFormState(template: MagnumClusterTemplate): TemplateFormState {
  return {
    name: template.name ?? "",
    coe: template.coe ?? "kubernetes",
    image_id: template.image_id ?? "",
    flavor_id: template.flavor_id ?? "",
    master_flavor_id: template.master_flavor_id ?? "",
    keypair_id: template.keypair_id ?? "",
    external_network_id: template.external_network_id ?? "",
    fixed_network: template.fixed_network ?? "",
    fixed_subnet: template.fixed_subnet ?? "",
    dns_nameserver: template.dns_nameserver ?? "",
    docker_volume_size: template.docker_volume_size ? String(template.docker_volume_size) : "",
    public: template.public ?? false,
    registry_enabled: template.registry_enabled ?? false,
    tls_disabled: template.tls_disabled ?? false,
    floating_ip_enabled: template.floating_ip_enabled ?? false,
    labels: template.labels ? JSON.stringify(template.labels, null, 2) : "",
    description: template.description ?? "",
  };
}

const columns: ColumnDef<MagnumClusterTemplate>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "coe",
    header: "COE",
    meta: { fieldType: "string", visible: true, monospace: true },
  },
  {
    accessorKey: "image_id",
    header: "Image",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <span className="font-mono text-xs">{row.original.image_id || "-"}</span>
    ),
    meta: { fieldType: "string", visible: true, monospace: true },
  },
  {
    accessorKey: "flavor_id",
    header: "Worker Flavor",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => row.original.flavor_id || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "master_flavor_id",
    header: "Master Flavor",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => row.original.master_flavor_id || "-",
    meta: { fieldType: "string", visible: false },
  },
  {
    accessorKey: "external_network_id",
    header: "External Network",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.external_network_id || "-",
    meta: { fieldType: "string", visible: false },
  },
  {
    accessorKey: "public",
    header: "Visibility",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) => (
      <Badge variant={row.original.public ? "default" : "secondary"}>
        {row.original.public ? "Public" : "Private"}
      </Badge>
    ),
    meta: { fieldType: "boolean", visible: true },
  },
  {
    accessorKey: "registry_enabled",
    header: "Registry",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.registry_enabled ? "Enabled" : "Disabled",
    meta: { fieldType: "boolean", visible: false },
  },
  {
    accessorKey: "floating_ip_enabled",
    header: "Floating IP",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.floating_ip_enabled ? "Enabled" : "Disabled",
    meta: { fieldType: "boolean", visible: false },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }: { row: { original: MagnumClusterTemplate } }) =>
      row.original.created_at ? format(new Date(row.original.created_at), "yyyy-MM-dd HH:mm") : "-",
    meta: { fieldType: "date", visible: false },
  },
];

export function TemplatesClient({ regionId, projectId }: TemplatesClientProps) {
  const queryClient = useQueryClient();
  const { data, isRefetching, refetch } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );

  const [toast, setToast] = useState<ToastState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MagnumClusterTemplate | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<MagnumClusterTemplate[]>([]);

  const [createForm, setCreateForm] = useState<TemplateFormState>(INITIAL_FORM_STATE);
  const [editForm, setEditForm] = useState<TemplateFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const createTemplate = useMutation(createClusterTemplateMutationOptions(regionId));
  const updateTemplate = useMutation(updateClusterTemplateMutationOptions(regionId));
  const deleteTemplate = useMutation(deleteClusterTemplateMutationOptions(regionId));

  const pushToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const invalidateTemplates = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "magnum", "cluster-templates"],
    });
  }, [projectId, queryClient, regionId]);

  const rowActions: DataTableRowAction<MagnumClusterTemplate>[] = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows) => {
          if (!rows.length) {
            return;
          }
          const template = rows[0];
          setEditTarget(template);
          setEditForm(templateToFormState(template));
          setFormError(null);
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
        },
      },
    ],
    [],
  );

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!createForm.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    if (!createForm.image_id.trim()) {
      setFormError("Image ID is required.");
      return;
    }

    try {
      const payload = buildCreatePayload(createForm);
      await createTemplate.mutateAsync(payload);
      await invalidateTemplates();
      pushToast("success", `Cluster template "${payload.name}" created.`);
      setCreateForm(INITIAL_FORM_STATE);
      setCreateOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create template.");
    }
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget || !editForm) {
      return;
    }

    setFormError(null);

    try {
      const payload = buildUpdatePayload(editForm, editTarget);

      if (Object.keys(payload).length === 0) {
        pushToast("success", "No changes detected.");
        setEditTarget(null);
        setEditForm(null);
        return;
      }

      await updateTemplate.mutateAsync({ uuid: editTarget.uuid, payload });
      await invalidateTemplates();
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "magnum", "cluster-template", editTarget.uuid],
      });
      pushToast("success", `Cluster template "${editTarget.name}" updated.`);
      setEditTarget(null);
      setEditForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update template.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTargets.length) {
      setDeleteTargets([]);
      return;
    }

    try {
      await Promise.all(deleteTargets.map((template) => deleteTemplate.mutateAsync(template.uuid)));
      await invalidateTemplates();
      deleteTargets.forEach((template) =>
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "magnum", "cluster-template", template.uuid],
        }),
      );
      pushToast(
        "success",
        deleteTargets.length === 1
          ? `Cluster template "${deleteTargets[0].name}" deleted.`
          : `${deleteTargets.length} cluster templates deleted.`,
      );
      setDeleteTargets([]);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to delete templates.");
    }
  };

  const renderToast = () => {
    if (!toast) {
      return null;
    }

    const Icon = toast.type === "success" ? CheckCircle2 : AlertTriangle;
    const colorClasses =
      toast.type === "success"
        ? "bg-emerald-500/10 border-emerald-500 text-emerald-600"
        : "bg-red-500/10 border-red-500 text-red-600";

    return (
      <div className="fixed top-4 right-4 z-50">
        <div className={`flex items-center gap-3 rounded-md border px-4 py-3 shadow-lg ${colorClasses}`}>
          <Icon className="h-5 w-5" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      </div>
    );
  };

  const renderFormFields = (state: TemplateFormState, setState: (updater: TemplateFormState) => void) => (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={state.name}
            onChange={(event) => setState({ ...state, name: event.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="template-coe">COE</Label>
          <select
            id="template-coe"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={state.coe}
            onChange={(event) => setState({ ...state, coe: event.target.value as MagnumCOEType })}
          >
            <option value="kubernetes">Kubernetes</option>
            <option value="swarm">Docker Swarm</option>
            <option value="mesos">Mesos</option>
            <option value="dcos">DC/OS</option>
            <option value="k8s_fedora">K8s (Fedora CoreOS)</option>
            <option value="k8s_coreos">K8s (CoreOS)</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="template-image">Image ID</Label>
        <Input
          id="template-image"
          value={state.image_id}
          onChange={(event) => setState({ ...state, image_id: event.target.value })}
          required
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-worker-flavor">Worker Flavor</Label>
          <Input
            id="template-worker-flavor"
            value={state.flavor_id}
            onChange={(event) => setState({ ...state, flavor_id: event.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="template-master-flavor">Master Flavor</Label>
          <Input
            id="template-master-flavor"
            value={state.master_flavor_id}
            onChange={(event) => setState({ ...state, master_flavor_id: event.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-keypair">Keypair</Label>
          <Input
            id="template-keypair"
            value={state.keypair_id}
            onChange={(event) => setState({ ...state, keypair_id: event.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="template-docker-volume">Docker Volume Size (GiB)</Label>
          <Input
            id="template-docker-volume"
            value={state.docker_volume_size}
            onChange={(event) => setState({ ...state, docker_volume_size: event.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-external-network">External Network ID</Label>
          <Input
            id="template-external-network"
            value={state.external_network_id}
            onChange={(event) => setState({ ...state, external_network_id: event.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="template-fixed-network">Fixed Network ID</Label>
          <Input
            id="template-fixed-network"
            value={state.fixed_network}
            onChange={(event) => setState({ ...state, fixed_network: event.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-fixed-subnet">Fixed Subnet ID</Label>
          <Input
            id="template-fixed-subnet"
            value={state.fixed_subnet}
            onChange={(event) => setState({ ...state, fixed_subnet: event.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="template-dns">DNS Nameserver</Label>
          <Input
            id="template-dns"
            value={state.dns_nameserver}
            onChange={(event) => setState({ ...state, dns_nameserver: event.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="template-description">Description</Label>
        <Textarea
          id="template-description"
          value={state.description}
          onChange={(event) => setState({ ...state, description: event.target.value })}
          placeholder="Optional description for operators"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="template-labels">Labels (JSON object)</Label>
        <Textarea
          id="template-labels"
          value={state.labels}
          onChange={(event) => setState({ ...state, labels: event.target.value })}
          placeholder='e.g. {"kube_tag": "v1.29.3"}'
          rows={3}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.public}
            onCheckedChange={(checked: CheckedState) => setState({ ...state, public: !!checked })}
          />
          Public template
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.registry_enabled}
            onCheckedChange={(checked: CheckedState) =>
              setState({ ...state, registry_enabled: !!checked })
            }
          />
          Enable registry
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.tls_disabled}
            onCheckedChange={(checked: CheckedState) => setState({ ...state, tls_disabled: !!checked })}
          />
          Disable TLS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.floating_ip_enabled}
            onCheckedChange={(checked: CheckedState) =>
              setState({ ...state, floating_ip_enabled: !!checked })
            }
          />
          Enable floating IPs
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderToast()}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cluster Templates</h1>
          <p className="text-sm text-muted-foreground">
            Curate templates that define how Kubernetes and other COE clusters are provisioned.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 self-start">
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      <DataTable
        data={data}
        columns={columns}
        resourceName="cluster template"
        emptyIcon={Pencil}
        isRefetching={isRefetching}
        refetch={refetch}
        rowActions={rowActions}
      />

      <Dialog open={createOpen} onOpenChange={(open: boolean) => {
        setCreateOpen(open);
        if (!open) {
          setCreateForm(INITIAL_FORM_STATE);
          setFormError(null);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Cluster Template</DialogTitle>
            <DialogDescription>
              Define reusable configuration for new Magnum clusters.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-6">
            {renderFormFields(createForm, (state) => setCreateForm(state))}

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTemplate.isPending}>
                {createTemplate.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setEditTarget(null);
            setEditForm(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Cluster Template</DialogTitle>
            <DialogDescription>
              Update lifecycle attributes for template {editTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          {editTarget && editForm && (
            <form onSubmit={handleEditSubmit} className="space-y-6">
              {renderFormFields(editForm, (state) => setEditForm(state))}

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setEditTarget(null);
                  setEditForm(null);
                  setFormError(null);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTemplate.isPending}>
                  {updateTemplate.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTargets.length > 0}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteTargets([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cluster Template{deleteTargets.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Magnum clusters referencing these templates will remain, but future cluster launches will need a replacement template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              You are about to delete:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {deleteTargets.map((template) => (
                <li key={template.uuid}>
                  <span className="font-medium">{template.name}</span>{" "}
                  <span className="text-muted-foreground font-mono text-xs">({template.uuid})</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargets([])}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteTemplate.isPending}
            >
              {deleteTemplate.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

