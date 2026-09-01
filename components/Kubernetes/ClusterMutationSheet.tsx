"use client";

import { useMemo, useState, useTransition } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  KeyRound,
  Network,
  ServerCog,
} from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import {
  AvailabilityZoneMultiSelect,
  AvailabilityZoneSelect,
} from "@/components/Kubernetes/AvailabilityZoneSelect";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { loadBalancerAvailabilityZonesQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { shareNetworksQueryOptions } from "@/hooks/queries/useManila";
import {
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  flavorsQueryOptions,
  keypairsQueryOptions,
  serverAvailabilityZonesQueryOptions,
} from "@/hooks/queries/useServers";
import {
  volumeAvailabilityZonesQueryOptions,
  volumeTypesQueryOptions,
} from "@/hooks/queries/useVolumes";
import { formatFlavorCapacity } from "@/lib/openstack/flavor";
import { createClusterAction } from "@/lib/openstack/magnum-actions";
import { normalizeKubernetesVersion } from "@/lib/openstack/magnum-domain";
import type { MagnumCluster } from "@/types/openstack";

const INHERIT = "template-default";
const NO_KEYPAIR = "no-keypair";

function templateVersion(template: { labels?: Record<string, string> }) {
  return (
    normalizeKubernetesVersion(template.labels?.kube_tag) || "Not reported"
  );
}

interface ClusterMutationSheetProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
}

interface FormState {
  name: string;
  clusterTemplateId: string;
  controlPlaneCount: string;
  workerCount: string;
  createTimeout: string;
  keypair: string;
  controlPlaneFlavorId: string;
  workerFlavorId: string;
  fixedNetwork: string;
  fixedSubnet: string;
  masterLoadBalancer: string;
  apiFloatingIp: string;
  podCidr: string;
  serviceCidr: string;
  fixedSubnetCidr: string;
  apiServerFloatingIp: string;
  apiServerCertSans: string;
  availabilityZone: string;
  controlPlaneAvailabilityZones: string;
  apiServerLbAvailabilityZone: string;
  bootVolumeType: string;
  bootVolumeAvailabilityZone: string;
  manilaCsi: string;
  manilaCsiShareNetworkId: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcUsernameClaim: string;
  oidcUsernamePrefix: string;
  oidcGroupsClaim: string;
  oidcGroupsPrefix: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  clusterTemplateId: "",
  controlPlaneCount: "3",
  workerCount: "0",
  createTimeout: "60",
  keypair: NO_KEYPAIR,
  controlPlaneFlavorId: INHERIT,
  workerFlavorId: INHERIT,
  fixedNetwork: "",
  fixedSubnet: "",
  masterLoadBalancer: INHERIT,
  apiFloatingIp: INHERIT,
  podCidr: "",
  serviceCidr: "",
  fixedSubnetCidr: "",
  apiServerFloatingIp: "",
  apiServerCertSans: "",
  availabilityZone: "",
  controlPlaneAvailabilityZones: "",
  apiServerLbAvailabilityZone: "",
  bootVolumeType: "",
  bootVolumeAvailabilityZone: "",
  manilaCsi: INHERIT,
  manilaCsiShareNetworkId: "",
  oidcIssuerUrl: "",
  oidcClientId: "",
  oidcUsernameClaim: "",
  oidcUsernamePrefix: "",
  oidcGroupsClaim: "",
  oidcGroupsPrefix: "",
};

function labelEnabled(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function optionLabel(name: string | null | undefined, id: string) {
  return name && name !== id ? `${name} · ${id}` : id;
}

function booleanOverride(value: string) {
  return value === INHERIT ? undefined : value === "enabled";
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

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[13rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{value}</dd>
    </div>
  );
}

export function ClusterMutationSheet({
  onOpenChange,
  open,
  projectId,
  regionId,
}: ClusterMutationSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL_FORM);
  const [activeTab, setActiveTab] = useState("cluster");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { data: templates } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );
  const { data: flavors = [] } = useQuery(
    flavorsQueryOptions(regionId, projectId),
  );
  const { data: keypairs = [] } = useQuery(
    keypairsQueryOptions(regionId, projectId),
  );
  const { data: networks = [] } = useQuery(
    projectNetworksQueryOptions(regionId, projectId),
  );
  const { data: subnets = [] } = useQuery(
    subnetsQueryOptions(regionId, projectId),
  );
  const shareNetworks = useQuery({
    ...shareNetworksQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const computeAvailabilityZones = useQuery({
    ...serverAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const loadBalancerAvailabilityZones = useQuery({
    ...loadBalancerAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const volumeTypes = useQuery({
    ...volumeTypesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const volumeAvailabilityZones = useQuery({
    ...volumeAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const selectedTemplate = templates.find(
    (template) => template.uuid === form.clusterTemplateId,
  );
  const flavorsById = useMemo(
    () => new Map(flavors.map((flavor) => [String(flavor.id), flavor])),
    [flavors],
  );
  const networkOptions = useMemo(
    () =>
      networks
        .filter(
          (network) =>
            !network["router:external"] &&
            network.admin_state_up &&
            network.status.toUpperCase() !== "DOWN",
        )
        .sort((left, right) =>
          (left.name || left.id).localeCompare(right.name || right.id),
        ),
    [networks],
  );
  const effectiveLoadBalancer =
    booleanOverride(form.masterLoadBalancer) ??
    selectedTemplate?.master_lb_enabled ??
    true;
  const effectiveApiFloatingIp =
    booleanOverride(form.apiFloatingIp) ??
    labelEnabled(
      selectedTemplate?.labels?.master_lb_floating_ip_enabled,
      selectedTemplate?.floating_ip_enabled ?? true,
    );
  const effectiveFixedNetwork =
    form.fixedNetwork || selectedTemplate?.fixed_network;
  const selectedTemplateReady = Boolean(selectedTemplate?.external_network_id);
  const effectiveManilaCsi =
    booleanOverride(form.manilaCsi) ??
    labelEnabled(selectedTemplate?.labels?.manila_csi_enabled, true);
  const selectedNetwork = networks.find(
    (network) =>
      network.id === effectiveFixedNetwork ||
      network.name === effectiveFixedNetwork,
  );
  const networkId = selectedNetwork?.id ?? effectiveFixedNetwork;
  const subnetOptions = subnets
    .filter((subnet) => subnet.network_id === networkId)
    .sort((left, right) =>
      (left.name || left.cidr).localeCompare(right.name || right.cidr),
    );
  const shareNetworkOptions = useMemo(
    () =>
      [...(shareNetworks.data ?? [])].sort((left, right) =>
        (left.name || left.id).localeCompare(right.name || right.id),
      ),
    [shareNetworks.data],
  );

  const update = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (isPending) return;
    setError(null);
    setActiveTab("cluster");
    onOpenChange(false);
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeTab !== "review") setActiveTab("review");
  };

  const createCluster = () => {
    if (activeTab !== "review") return;
    if (!projectId || !regionId) {
      setError("Select a project and region before creating a cluster.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createClusterAction(
        { projectId, regionId },
        {
          name: form.name,
          clusterTemplateId: form.clusterTemplateId,
          networkDriver:
            selectedTemplate?.network_driver === "calico" ? "calico" : "cilium",
          controlPlaneCount: Number(form.controlPlaneCount),
          workerCount: Number(form.workerCount),
          createTimeout: Number(form.createTimeout),
          keypair: form.keypair === NO_KEYPAIR ? undefined : form.keypair,
          controlPlaneFlavorId:
            form.controlPlaneFlavorId === INHERIT
              ? undefined
              : form.controlPlaneFlavorId,
          workerFlavorId:
            form.workerFlavorId === INHERIT ? undefined : form.workerFlavorId,
          fixedNetwork: form.fixedNetwork || undefined,
          fixedSubnet: form.fixedSubnet || undefined,
          masterLoadBalancerEnabled: booleanOverride(form.masterLoadBalancer),
          apiFloatingIpEnabled: booleanOverride(form.apiFloatingIp),
          podCidr: form.podCidr || undefined,
          serviceCidr: form.serviceCidr || undefined,
          fixedSubnetCidr: form.fixedSubnetCidr || undefined,
          apiServerFloatingIp: form.apiServerFloatingIp || undefined,
          apiServerCertSans: form.apiServerCertSans || undefined,
          availabilityZone: form.availabilityZone || undefined,
          controlPlaneAvailabilityZones:
            form.controlPlaneAvailabilityZones || undefined,
          apiServerLbAvailabilityZone:
            form.apiServerLbAvailabilityZone || undefined,
          bootVolumeType: form.bootVolumeType || undefined,
          bootVolumeAvailabilityZone:
            form.bootVolumeAvailabilityZone || undefined,
          manilaCsiEnabled: effectiveManilaCsi,
          manilaCsiShareNetworkId: form.manilaCsiShareNetworkId || undefined,
          oidcIssuerUrl: form.oidcIssuerUrl || undefined,
          oidcClientId: form.oidcClientId || undefined,
          oidcUsernameClaim: form.oidcUsernameClaim || undefined,
          oidcUsernamePrefix: form.oidcUsernamePrefix || undefined,
          oidcGroupsClaim: form.oidcGroupsClaim || undefined,
          oidcGroupsPrefix: form.oidcGroupsPrefix || undefined,
        },
      );

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "magnum"],
      });
      queryClient.setQueriesData<MagnumCluster[]>(
        {
          queryKey: [regionId, projectId, "magnum", "clusters"],
        },
        (current) => {
          if (!current) return current;
          if (current.some((cluster) => cluster.uuid === result.data.uuid)) {
            return current;
          }
          return [
            {
              uuid: result.data.uuid,
              name: form.name.trim(),
              status: "CREATE_IN_PROGRESS",
              status_reason: "Magnum accepted the cluster creation request.",
              cluster_template_id: form.clusterTemplateId,
              cluster_template: selectedTemplate,
              master_count: Number(form.controlPlaneCount),
              node_count: Number(form.workerCount),
              create_timeout: Number(form.createTimeout),
            },
            ...current,
          ];
        },
      );
      close();
    });
  };

  const selectedControlPlaneFlavor =
    form.controlPlaneFlavorId === INHERIT
      ? undefined
      : flavorsById.get(form.controlPlaneFlavorId);
  const selectedWorkerFlavor =
    form.workerFlavorId === INHERIT
      ? undefined
      : flavorsById.get(form.workerFlavorId);
  const canSubmit =
    Boolean(form.name.trim()) &&
    Boolean(form.clusterTemplateId) &&
    selectedTemplateReady &&
    Number(form.controlPlaneCount) >= 1 &&
    Number(form.controlPlaneCount) % 2 === 1 &&
    (effectiveLoadBalancer || Number(form.controlPlaneCount) === 1) &&
    Number(form.workerCount) >= 0 &&
    Number(form.createTimeout) >= 0 &&
    (!effectiveManilaCsi || Boolean(form.manilaCsiShareNetworkId)) &&
    (!form.oidcIssuerUrl.trim() || Boolean(form.oidcClientId.trim()));

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-4xl">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleFormSubmit}
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Create Kubernetes cluster</SheetTitle>
            <SheetDescription>
              Launch a Magnum cluster from a reusable Cluster API template.
            </SheetDescription>
          </SheetHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col px-4 pt-4"
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-6">
              <TabsTrigger value="cluster">Cluster</TabsTrigger>
              <TabsTrigger value="capacity">Capacity</TabsTrigger>
              <TabsTrigger value="networking">Networking</TabsTrigger>
              <TabsTrigger value="platform">Platform</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              <TabsContent className="space-y-7 pt-4" value="cluster">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Identity</h3>
                    <p className="text-xs text-muted-foreground">
                      Cluster names become part of the OpenStack and Kubernetes
                      resource identity.
                    </p>
                  </div>
                  <Field label="Cluster name">
                    <Input
                      autoFocus
                      maxLength={242}
                      placeholder="production-k8s"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Cluster template</h3>
                    <p className="text-xs text-muted-foreground">
                      The template defines Kubernetes, networking, storage, and
                      default machine shapes.
                    </p>
                  </div>
                  <Select
                    required
                    value={form.clusterTemplateId}
                    onValueChange={(value) =>
                      update("clusterTemplateId", value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a Kubernetes template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.uuid} value={template.uuid}>
                          {template.name} · {templateVersion(template)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate ? (
                    <>
                      <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Kubernetes
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {templateVersion(selectedTemplate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Network driver
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {selectedTemplate.network_driver || "Cloud default"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Visibility
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {selectedTemplate.public ? "Public" : "Private"}
                          </div>
                        </div>
                      </div>
                      {!selectedTemplateReady ? (
                        <div className="flex gap-2 border-y border-amber-500/40 bg-amber-500/5 px-1 py-3 text-sm">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                          <p>
                            This legacy template is missing an external network
                            required by the current CAPI driver. Edit the
                            template before creating a cluster.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-4" value="capacity">
                <section className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Boxes className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold">
                        Initial topology
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Control-plane capacity must be odd. Worker capacity can
                        be resized after creation.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Control-plane nodes"
                      description="Use 1, 3, 5, or another odd number."
                    >
                      <Input
                        inputMode="numeric"
                        min={1}
                        max={99}
                        step={2}
                        type="number"
                        value={form.controlPlaneCount}
                        onChange={(event) =>
                          update("controlPlaneCount", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Worker nodes">
                      <Input
                        inputMode="numeric"
                        min={0}
                        max={10000}
                        type="number"
                        value={form.workerCount}
                        onChange={(event) =>
                          update("workerCount", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-start gap-3">
                    <ServerCog className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold">Machine shapes</h3>
                      <p className="text-xs text-muted-foreground">
                        Keep template defaults unless this cluster needs
                        different capacity.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Control-plane flavor override">
                      <Select
                        value={form.controlPlaneFlavorId}
                        onValueChange={(value) =>
                          update("controlPlaneFlavorId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template default
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
                    <Field label="Worker flavor override">
                      <Select
                        value={form.workerFlavorId}
                        onValueChange={(value) =>
                          update("workerFlavorId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template default
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
                  </div>
                </section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-4" value="networking">
                <section className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Network className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold">
                        OpenStack network
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Keep template defaults or place this cluster on a
                        different active project network and subnet.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fixed network override">
                      <Select
                        value={form.fixedNetwork || INHERIT}
                        onValueChange={(value) => {
                          update(
                            "fixedNetwork",
                            value === INHERIT ? "" : value,
                          );
                          update("fixedSubnet", "");
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template default
                          </SelectItem>
                          {networkOptions.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {network.name || network.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Fixed subnet override">
                      <Select
                        disabled={!effectiveFixedNetwork}
                        value={form.fixedSubnet || INHERIT}
                        onValueChange={(value) =>
                          update("fixedSubnet", value === INHERIT ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            {effectiveFixedNetwork
                              ? "Network default"
                              : "Template default"}
                          </SelectItem>
                          {subnetOptions.map((subnet) => (
                            <SelectItem key={subnet.id} value={subnet.id}>
                              {subnet.name || subnet.cidr} · {subnet.cidr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-3 border-y py-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        External network
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedTemplate?.external_network_id ||
                          "Select a template"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        DNS resolvers
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedTemplate?.dns_nameserver ||
                          "Select a template"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    External network and DNS resolvers are template properties
                    in the current VEXXHOST Cluster API driver.
                  </p>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Kubernetes address ranges
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Blank fields inherit template labels or driver defaults.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Pod CIDR override">
                      <Input
                        placeholder="Template or driver default"
                        value={form.podCidr}
                        onChange={(event) =>
                          update("podCidr", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Service CIDR override">
                      <Input
                        placeholder="Template or driver default"
                        value={form.serviceCidr}
                        onChange={(event) =>
                          update("serviceCidr", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Automatically created subnet CIDR"
                      description="Applies only when neither the template nor this cluster selects a fixed network."
                    >
                      <Input
                        disabled={Boolean(effectiveFixedNetwork)}
                        placeholder="Template or driver default"
                        value={form.fixedSubnetCidr}
                        onChange={(event) =>
                          update("fixedSubnetCidr", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">API endpoint</h3>
                    <p className="text-xs text-muted-foreground">
                      Override load-balancer and floating-IP behavior for this
                      cluster without cloning its template.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="API load balancer">
                      <Select
                        value={form.masterLoadBalancer}
                        onValueChange={(value) =>
                          update("masterLoadBalancer", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template default
                          </SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Public API address">
                      <Select
                        value={form.apiFloatingIp}
                        onValueChange={(value) => {
                          update("apiFloatingIp", value);
                          if (value === "disabled") {
                            update("apiServerFloatingIp", "");
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template default
                          </SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Requested API floating IP"
                      description="Optional IPv4 floating address, not a Neutron UUID. CAPO attaches it when it exists or requests that address when allocating the API floating IP."
                    >
                      <Input
                        disabled={!effectiveApiFloatingIp}
                        placeholder="203.0.113.10 or allocate automatically"
                        value={form.apiServerFloatingIp}
                        onChange={(event) =>
                          update("apiServerFloatingIp", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  {!effectiveLoadBalancer &&
                  Number(form.controlPlaneCount) !== 1 ? (
                    <div className="flex gap-3 border-y border-amber-500/40 bg-amber-500/10 px-1 py-3 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p>
                        Magnum requires exactly one control-plane node when the
                        API load balancer is disabled.
                      </p>
                    </div>
                  ) : null}
                </section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-4" value="platform">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      OpenStack placement
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Override reusable template placement only when this
                      cluster needs project-specific zones or storage.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Worker availability zone"
                      description="Default placement for worker groups that do not select their own zone."
                    >
                      <AvailabilityZoneSelect
                        defaultLabel="Template or cloud default"
                        onValueChange={(value) =>
                          update("availabilityZone", value)
                        }
                        value={form.availabilityZone}
                        zones={(computeAvailabilityZones.data ?? []).map(
                          (zone) => zone.zoneName,
                        )}
                      />
                    </Field>
                    <Field
                      label="Control-plane availability zones"
                      description="Select one or more Nova zones. Blank lets the cloud scheduler place control-plane nodes."
                    >
                      <AvailabilityZoneMultiSelect
                        onValueChange={(value) =>
                          update("controlPlaneAvailabilityZones", value)
                        }
                        value={form.controlPlaneAvailabilityZones}
                        zones={(computeAvailabilityZones.data ?? []).map(
                          (zone) => zone.zoneName,
                        )}
                      />
                    </Field>
                    <Field label="Boot volume type">
                      <Select
                        value={form.bootVolumeType || INHERIT}
                        onValueChange={(value) =>
                          update(
                            "bootVolumeType",
                            value === INHERIT ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template or cloud default
                          </SelectItem>
                          {(volumeTypes.data ?? []).map((type) => (
                            <SelectItem key={type.id} value={type.name}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Boot volume availability zone">
                      <AvailabilityZoneSelect
                        defaultLabel="Worker or cloud default"
                        onValueChange={(value) =>
                          update("bootVolumeAvailabilityZone", value)
                        }
                        value={form.bootVolumeAvailabilityZone}
                        zones={(volumeAvailabilityZones.data ?? []).map(
                          (zone) => zone.zoneName,
                        )}
                      />
                    </Field>
                    <Field
                      label="API load balancer availability zone"
                      description="Octavia availability zone for this cluster's Kubernetes API load balancer."
                    >
                      <AvailabilityZoneSelect
                        defaultLabel="Template or cloud default"
                        onValueChange={(value) =>
                          update("apiServerLbAvailabilityZone", value)
                        }
                        value={form.apiServerLbAvailabilityZone}
                        zones={(loadBalancerAvailabilityZones.data ?? []).map(
                          (zone) => zone.name,
                        )}
                      />
                    </Field>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Shared file storage
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Manila share networks are project scoped and therefore
                      selected for each cluster, not stored in reusable public
                      templates.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Manila CSI">
                      <Select
                        value={form.manilaCsi}
                        onValueChange={(value) => {
                          update("manilaCsi", value);
                          if (value === "disabled") {
                            update("manilaCsiShareNetworkId", "");
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Template or driver default
                          </SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Manila share network"
                      description="Required to generate Manila-backed StorageClasses when Manila CSI is enabled."
                    >
                      <Select
                        disabled={!effectiveManilaCsi}
                        value={form.manilaCsiShareNetworkId}
                        onValueChange={(value) =>
                          update("manilaCsiShareNetworkId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a project share network" />
                        </SelectTrigger>
                        <SelectContent>
                          {shareNetworks.isLoading ? (
                            <SelectItem disabled value="loading-share-networks">
                              Loading share networks...
                            </SelectItem>
                          ) : null}
                          {shareNetworks.isError ? (
                            <SelectItem disabled value="share-networks-error">
                              Share networks are unavailable
                            </SelectItem>
                          ) : null}
                          {!shareNetworks.isLoading &&
                          !shareNetworks.isError &&
                          shareNetworkOptions.length === 0 ? (
                            <SelectItem disabled value="no-share-networks">
                              No share networks in this project
                            </SelectItem>
                          ) : null}
                          {shareNetworkOptions.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {optionLabel(network.name, network.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Kubernetes API identity
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      These cluster-specific settings are merged over template
                      labels when Magnum creates the control plane.
                    </p>
                  </div>
                  <Field
                    label="Additional certificate SANs"
                    description="Optional comma-separated DNS names or IPv4 addresses for this cluster's API certificate."
                  >
                    <Input
                      placeholder="api.example.com,192.0.2.10"
                      value={form.apiServerCertSans}
                      onChange={(event) =>
                        update("apiServerCertSans", event.target.value)
                      }
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="OIDC issuer URL">
                      <Input
                        placeholder="https://identity.example/realms/cloud"
                        value={form.oidcIssuerUrl}
                        onChange={(event) =>
                          update("oidcIssuerUrl", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="OIDC client ID"
                      description="Required when an issuer URL is provided."
                    >
                      <Input
                        value={form.oidcClientId}
                        onChange={(event) =>
                          update("oidcClientId", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Username claim">
                      <Input
                        placeholder="sub"
                        value={form.oidcUsernameClaim}
                        onChange={(event) =>
                          update("oidcUsernameClaim", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Username prefix">
                      <Input
                        placeholder="-"
                        value={form.oidcUsernamePrefix}
                        onChange={(event) =>
                          update("oidcUsernamePrefix", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Groups claim">
                      <Input
                        value={form.oidcGroupsClaim}
                        onChange={(event) =>
                          update("oidcGroupsClaim", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Groups prefix">
                      <Input
                        value={form.oidcGroupsPrefix}
                        onChange={(event) =>
                          update("oidcGroupsPrefix", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-4" value="access">
                <section className="space-y-4">
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold">Operator access</h3>
                      <p className="text-xs text-muted-foreground">
                        An SSH key is optional and does not replace Kubernetes
                        credentials.
                      </p>
                    </div>
                  </div>
                  <Field label="Key pair">
                    <Select
                      value={form.keypair}
                      onValueChange={(value) => update("keypair", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_KEYPAIR}>No key pair</SelectItem>
                        {keypairs.map((keypair) => (
                          <SelectItem key={keypair.name} value={keypair.name}>
                            {keypair.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Create timeout"
                    description="Magnum marks creation failed if provisioning does not finish within this many minutes. Use 0 to disable the timeout."
                  >
                    <Input
                      inputMode="numeric"
                      min={0}
                      max={1440}
                      type="number"
                      value={form.createTimeout}
                      onChange={(event) =>
                        update("createTimeout", event.target.value)
                      }
                    />
                  </Field>
                </section>
              </TabsContent>

              <TabsContent className="space-y-5 pt-4" value="review">
                <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p>
                    Creating a cluster allocates compute, network,
                    load-balancer, and storage resources. Provisioning continues
                    after this sheet closes.
                  </p>
                </div>
                <dl className="rounded-md border px-4">
                  <ReviewRow label="Name" value={form.name || "Not set"} />
                  <ReviewRow
                    label="Template"
                    value={selectedTemplate?.name || "Not selected"}
                  />
                  <ReviewRow
                    label="Kubernetes"
                    value={
                      selectedTemplate ? templateVersion(selectedTemplate) : "-"
                    }
                  />
                  <ReviewRow
                    label="Topology"
                    value={`${form.controlPlaneCount || 0} control plane / ${form.workerCount || 0} worker`}
                  />
                  <ReviewRow
                    label="Control-plane flavor"
                    value={
                      selectedControlPlaneFlavor
                        ? formatFlavorCapacity(selectedControlPlaneFlavor)
                        : "Template default"
                    }
                  />
                  <ReviewRow
                    label="Worker flavor"
                    value={
                      selectedWorkerFlavor
                        ? formatFlavorCapacity(selectedWorkerFlavor)
                        : "Template default"
                    }
                  />
                  <ReviewRow
                    label="Fixed network"
                    value={form.fixedNetwork || "Template default"}
                  />
                  <ReviewRow
                    label="Fixed subnet"
                    value={form.fixedSubnet || "Template default"}
                  />
                  <ReviewRow
                    label="Pod CIDR"
                    value={form.podCidr || "Template or driver default"}
                  />
                  <ReviewRow
                    label="Service CIDR"
                    value={form.serviceCidr || "Template or driver default"}
                  />
                  <ReviewRow
                    label="API load balancer"
                    value={
                      form.masterLoadBalancer === INHERIT
                        ? "Template default"
                        : form.masterLoadBalancer === "enabled"
                          ? "Enabled"
                          : "Disabled"
                    }
                  />
                  <ReviewRow
                    label="Public API address"
                    value={
                      form.apiFloatingIp === INHERIT
                        ? "Template default"
                        : form.apiFloatingIp === "enabled"
                          ? "Enabled"
                          : "Disabled"
                    }
                  />
                  <ReviewRow
                    label="Requested API floating IP"
                    value={form.apiServerFloatingIp || "Allocate automatically"}
                  />
                  <ReviewRow
                    label="Manila CSI"
                    value={effectiveManilaCsi ? "Enabled" : "Disabled"}
                  />
                  <ReviewRow
                    label="Worker availability zone"
                    value={form.availabilityZone || "Template or cloud default"}
                  />
                  <ReviewRow
                    label="Control-plane availability zones"
                    value={
                      form.controlPlaneAvailabilityZones || "Cloud scheduler"
                    }
                  />
                  <ReviewRow
                    label="Boot volume"
                    value={`${form.bootVolumeType || "Template or cloud default"} · ${form.bootVolumeAvailabilityZone || "worker or cloud zone"}`}
                  />
                  <ReviewRow
                    label="API load balancer zone"
                    value={
                      form.apiServerLbAvailabilityZone ||
                      "Template or cloud default"
                    }
                  />
                  <ReviewRow
                    label="Manila share network"
                    value={
                      effectiveManilaCsi
                        ? form.manilaCsiShareNetworkId || "Not selected"
                        : "Not used"
                    }
                  />
                  <ReviewRow
                    label="Additional certificate SANs"
                    value={form.apiServerCertSans || "None"}
                  />
                  <ReviewRow
                    label="OpenID Connect"
                    value={
                      form.oidcIssuerUrl
                        ? `${form.oidcIssuerUrl} · ${form.oidcClientId || "client ID missing"}`
                        : "Not configured"
                    }
                  />
                  <ReviewRow
                    label="SSH key"
                    value={form.keypair === NO_KEYPAIR ? "None" : form.keypair}
                  />
                  <ReviewRow
                    label="Timeout"
                    value={`${form.createTimeout || 0} minutes`}
                  />
                </dl>
              </TabsContent>
            </div>
          </Tabs>

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
            {activeTab === "review" ? (
              <Button
                disabled={!canSubmit || isPending}
                onClick={createCluster}
                type="button"
              >
                {isPending ? "Starting creation" : "Create cluster"}
              </Button>
            ) : (
              <Button
                disabled={isPending}
                onClick={() => setActiveTab("review")}
                type="button"
              >
                Review cluster
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
