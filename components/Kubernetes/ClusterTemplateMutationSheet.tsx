"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { ImagePicker } from "@/components/Image/ImageSelectOption";
import {
  AvailabilityZoneMultiSelect,
  AvailabilityZoneSelect,
} from "@/components/Kubernetes/AvailabilityZoneSelect";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import { loadBalancerAvailabilityZonesQueryOptions } from "@/hooks/queries/useLoadBalancers";
import {
  externalNetworksQueryOptions,
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  flavorsQueryOptions,
  serverAvailabilityZonesQueryOptions,
} from "@/hooks/queries/useServers";
import {
  volumeAvailabilityZonesQueryOptions,
  volumeTypesQueryOptions,
} from "@/hooks/queries/useVolumes";
import {
  createClusterTemplateAction,
  updateClusterTemplateAction,
} from "@/lib/openstack/magnum-actions";
import { formatFlavorCapacity } from "@/lib/openstack/flavor";
import { resolveClusterTemplateDnsNameserver } from "@/lib/openstack/magnum-template";
import {
  isMagnumCompatibleImage,
  normalizeKubernetesVersion,
} from "@/lib/openstack/magnum-domain";
import { MAGNUM_DRIVER_LABEL_KEYS } from "@/lib/openstack/magnum-labels";
import type {
  MagnumClusterTemplate,
  MagnumClusterTemplateMutationInput,
} from "@/types/openstack";

const CONTROLLED_LABELS = new Set(MAGNUM_DRIVER_LABEL_KEYS);

type CustomLabel = { id: number; key: string; value: string };

type FormState = {
  name: string;
  imageId: string;
  kubernetesVersion: string;
  workerFlavorId: string;
  controlPlaneFlavorId: string;
  networkDriver: "cilium" | "calico";
  externalNetworkId: string;
  dnsNameserver: string;
  fixedNetwork: string;
  fixedSubnet: string;
  public: boolean;
  masterLoadBalancerEnabled: boolean;
  apiFloatingIpEnabled: boolean;
  autoHealingEnabled: boolean;
  autoScalingEnabled: boolean;
  cniVersion: string;
  ciliumHubbleUiEnabled: boolean;
  podCidr: string;
  serviceCidr: string;
  clusterDomain: string;
  fixedSubnetCidr: string;
  apiServerFloatingIp: string;
  apiServerCertSans: string;
  apiServerTlsCipherSuites: string;
  kubeletTlsCipherSuites: string;
  admissionControlList: string;
  availabilityZone: string;
  controlPlaneAvailabilityZones: string;
  differentFailureDomain: boolean;
  serverGroupPolicies: string;
  octaviaProvider: string;
  octaviaLbAlgorithm: string;
  octaviaLbHealthcheck: boolean;
  apiServerLbFlavor: string;
  apiServerLbAvailabilityZone: string;
  bootVolumeSize: string;
  bootVolumeType: string;
  bootVolumeAvailabilityZone: string;
  dockerVolumeType: string;
  etcdVolumeSize: string;
  etcdVolumeType: string;
  cinderCsiEnabled: boolean;
  cinderCsiPluginTag: string;
  manilaCsiEnabled: boolean;
  manilaCsiPluginTag: string;
  manilaCsiShareNetworkId: string;
  csiAttacherTag: string;
  csiLivenessProbeTag: string;
  csiNodeDriverRegistrarTag: string;
  csiProvisionerTag: string;
  csiResizerTag: string;
  csiSnapshotterTag: string;
  cloudProviderTag: string;
  containerInfraPrefix: string;
  keystoneAuthEnabled: boolean;
  auditLogEnabled: boolean;
  auditLogMaxAge: string;
  auditLogMaxBackup: string;
  auditLogMaxSize: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcUsernameClaim: string;
  oidcUsernamePrefix: string;
  oidcGroupsClaim: string;
  oidcGroupsPrefix: string;
  httpProxy: string;
  httpsProxy: string;
  noProxy: string;
};

interface ClusterTemplateMutationSheetProps {
  onComplete?: (template: MagnumClusterTemplate) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
  template?: MagnumClusterTemplate;
}

function booleanLabel(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function initialState(template?: MagnumClusterTemplate): FormState {
  const labels = template?.labels ?? {};
  const networkDriver =
    template?.network_driver === "calico" ? "calico" : "cilium";

  return {
    name: template?.name ?? "",
    imageId: template?.image_id ?? "",
    kubernetesVersion: normalizeKubernetesVersion(labels.kube_tag).replace(
      /^-$/,
      "",
    ),
    workerFlavorId: template?.flavor_id ?? "",
    controlPlaneFlavorId: template?.master_flavor_id ?? "",
    networkDriver,
    externalNetworkId: template?.external_network_id ?? "",
    dnsNameserver: template?.dns_nameserver ?? "",
    fixedNetwork: template?.fixed_network ?? "",
    fixedSubnet: template?.fixed_subnet ?? "",
    public: template?.public ?? false,
    masterLoadBalancerEnabled: template?.master_lb_enabled ?? true,
    apiFloatingIpEnabled: booleanLabel(
      labels.master_lb_floating_ip_enabled,
      template?.floating_ip_enabled ?? true,
    ),
    autoHealingEnabled: booleanLabel(labels.auto_healing_enabled, true),
    autoScalingEnabled: booleanLabel(labels.auto_scaling_enabled, false),
    cniVersion:
      labels[networkDriver === "cilium" ? "cilium_tag" : "calico_tag"] ?? "",
    ciliumHubbleUiEnabled: booleanLabel(labels.cilium_hubble_ui_enabled, false),
    podCidr:
      labels[
        networkDriver === "cilium" ? "cilium_ipv4pool" : "calico_ipv4pool"
      ] ?? "",
    serviceCidr: labels.service_cluster_ip_range ?? "",
    clusterDomain: labels.dns_cluster_domain ?? "",
    fixedSubnetCidr: labels.fixed_subnet_cidr ?? "",
    apiServerFloatingIp: labels.api_server_floating_ip ?? "",
    apiServerCertSans: labels.api_server_cert_sans ?? "",
    apiServerTlsCipherSuites: labels.api_server_tls_cipher_suites ?? "",
    kubeletTlsCipherSuites: labels.kubelet_tls_cipher_suites ?? "",
    admissionControlList: labels.admission_control_list ?? "",
    availabilityZone: labels.availability_zone ?? "",
    controlPlaneAvailabilityZones:
      labels.control_plane_availability_zones ?? "",
    differentFailureDomain: booleanLabel(
      labels.different_failure_domain,
      false,
    ),
    serverGroupPolicies: labels.server_group_policies ?? "",
    octaviaProvider: labels.octavia_provider ?? "",
    octaviaLbAlgorithm: labels.octavia_lb_algorithm ?? "",
    octaviaLbHealthcheck: booleanLabel(labels.octavia_lb_healthcheck, true),
    apiServerLbFlavor: labels.api_server_lb_flavor ?? "",
    apiServerLbAvailabilityZone: labels.api_server_lb_availability_zone ?? "",
    bootVolumeSize: labels.boot_volume_size ?? "",
    bootVolumeType: labels.boot_volume_type ?? "",
    bootVolumeAvailabilityZone: labels.boot_volume_availability_zone ?? "",
    dockerVolumeType: labels.docker_volume_type ?? "",
    etcdVolumeSize: labels.etcd_volume_size ?? "",
    etcdVolumeType: labels.etcd_volume_type ?? "",
    cinderCsiEnabled: booleanLabel(labels.cinder_csi_enabled, true),
    cinderCsiPluginTag: labels.cinder_csi_plugin_tag ?? "",
    manilaCsiEnabled: booleanLabel(labels.manila_csi_enabled, true),
    manilaCsiPluginTag: labels.manila_csi_plugin_tag ?? "",
    manilaCsiShareNetworkId: labels.manila_csi_share_network_id ?? "",
    csiAttacherTag: labels.csi_attacher_tag ?? "",
    csiLivenessProbeTag: labels.csi_liveness_probe_tag ?? "",
    csiNodeDriverRegistrarTag: labels.csi_node_driver_registrar_tag ?? "",
    csiProvisionerTag: labels.csi_provisioner_tag ?? "",
    csiResizerTag: labels.csi_resizer_tag ?? "",
    csiSnapshotterTag: labels.csi_snapshotter_tag ?? "",
    cloudProviderTag: labels.cloud_provider_tag ?? "",
    containerInfraPrefix: labels.container_infra_prefix ?? "",
    keystoneAuthEnabled: booleanLabel(labels.keystone_auth_enabled, true),
    auditLogEnabled: booleanLabel(labels.audit_log_enabled, false),
    auditLogMaxAge: labels.audit_log_max_age ?? "",
    auditLogMaxBackup: labels.audit_log_max_backup ?? "",
    auditLogMaxSize: labels.audit_log_max_size ?? "",
    oidcIssuerUrl: labels.oidc_issuer_url ?? "",
    oidcClientId: labels.oidc_client_id ?? "",
    oidcUsernameClaim: labels.oidc_username_claim ?? "",
    oidcUsernamePrefix: labels.oidc_username_prefix ?? "",
    oidcGroupsClaim: labels.oidc_groups_claim ?? "",
    oidcGroupsPrefix: labels.oidc_groups_prefix ?? "",
    httpProxy: template?.http_proxy ?? "",
    httpsProxy: template?.https_proxy ?? "",
    noProxy: template?.no_proxy ?? "",
  };
}

function initialCustomLabels(template?: MagnumClusterTemplate): CustomLabel[] {
  return Object.entries(template?.labels ?? {})
    .filter(([key]) => !CONTROLLED_LABELS.has(key))
    .map(([key, value], index) => ({ id: index, key, value }));
}

function optionalInteger(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : undefined;
}

function optionLabel(name: string | null | undefined, id: string) {
  return name && name !== id ? `${name} · ${id}` : id;
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

function Section({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

function CurrentValueOption({
  current,
  values,
}: {
  current: string;
  values: string[];
}) {
  return current && !values.includes(current) ? (
    <SelectItem value={current}>{current}</SelectItem>
  ) : null;
}

export function ClusterTemplateMutationSheet({
  onComplete,
  onOpenChange,
  open,
  projectId,
  regionId,
  template,
}: ClusterTemplateMutationSheetProps) {
  const editing = Boolean(template);
  const queryClient = useQueryClient();
  const images = useQuery({
    ...imagesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const flavors = useQuery({
    ...flavorsQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const externalNetworks = useQuery({
    ...externalNetworksQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const networks = useQuery({
    ...projectNetworksQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const subnets = useQuery({
    ...subnetsQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const volumeTypes = useQuery({
    ...volumeTypesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const computeAvailabilityZones = useQuery({
    ...serverAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const volumeAvailabilityZones = useQuery({
    ...volumeAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const loadBalancerAvailabilityZones = useQuery({
    ...loadBalancerAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const [form, setForm] = useState(() => initialState(template));
  const [customLabels, setCustomLabels] = useState(() =>
    initialCustomLabels(template),
  );
  const nextCustomLabelId = useRef(customLabels.length);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const imageOptions = useMemo(
    () =>
      (images.data ?? [])
        .filter(
          (image) =>
            image.status === "active" &&
            !image.os_hidden &&
            isMagnumCompatibleImage(image),
        )
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
    [images.data],
  );
  const flavorOptions = useMemo(
    () =>
      (flavors.data ?? [])
        .filter((flavor) => !flavor["OS-FLV-DISABLED:disabled"])
        .sort((a, b) => a.name.localeCompare(b.name)),
    [flavors.data],
  );
  const externalNetworkOptions = useMemo(
    () =>
      [...(externalNetworks.data ?? [])].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id),
      ),
    [externalNetworks.data],
  );
  const networkOptions = useMemo(
    () =>
      [...(networks.data ?? [])].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id),
      ),
    [networks.data],
  );
  const subnetOptions = useMemo(
    () =>
      (subnets.data ?? [])
        .filter(
          (subnet) =>
            !form.fixedNetwork || subnet.network_id === form.fixedNetwork,
        )
        .sort((a, b) => (a.name || a.cidr).localeCompare(b.name || b.cidr)),
    [form.fixedNetwork, subnets.data],
  );
  const selectedFixedSubnet = (subnets.data ?? []).find(
    (subnet) => subnet.id === form.fixedSubnet,
  );

  const update = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (isPending) return;
    setError(null);
    onOpenChange(false);
  };

  const addCustomLabel = () => {
    const id = nextCustomLabelId.current;
    nextCustomLabelId.current += 1;
    setCustomLabels((current) => [...current, { id, key: "", value: "" }]);
  };

  const updateCustomLabel = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    setCustomLabels((current) =>
      current.map((label, labelIndex) =>
        labelIndex === index ? { ...label, [field]: value } : label,
      ),
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId) {
      setError("Select a project and region before changing templates.");
      return;
    }

    const customLabelEntries = customLabels
      .map((label) => [label.key.trim(), label.value] as const)
      .filter(([key]) => Boolean(key));
    const keys = customLabelEntries.map(([key]) => key);
    if (new Set(keys).size !== keys.length) {
      setError("Custom label keys must be unique.");
      return;
    }
    if (keys.some((key) => CONTROLLED_LABELS.has(key))) {
      setError(
        "A custom label duplicates a setting managed in another section.",
      );
      return;
    }

    const input: MagnumClusterTemplateMutationInput = {
      name: form.name,
      imageId: form.imageId,
      kubernetesVersion: form.kubernetesVersion,
      workerFlavorId: form.workerFlavorId,
      controlPlaneFlavorId: form.controlPlaneFlavorId,
      networkDriver: form.networkDriver,
      externalNetworkId: form.externalNetworkId,
      dnsNameserver: resolveClusterTemplateDnsNameserver(
        form.dnsNameserver,
        selectedFixedSubnet?.dns_nameservers,
      ),
      fixedNetwork: form.fixedNetwork || undefined,
      fixedSubnet: form.fixedSubnet || undefined,
      public: form.public,
      masterLoadBalancerEnabled: form.masterLoadBalancerEnabled,
      apiFloatingIpEnabled: form.apiFloatingIpEnabled,
      autoHealingEnabled: form.autoHealingEnabled,
      autoScalingEnabled: form.autoScalingEnabled,
      cniVersion: form.cniVersion || undefined,
      ciliumHubbleUiEnabled: form.ciliumHubbleUiEnabled,
      podCidr: form.podCidr,
      serviceCidr: form.serviceCidr,
      clusterDomain: form.clusterDomain,
      fixedSubnetCidr: form.fixedSubnetCidr || undefined,
      apiServerFloatingIp: form.apiServerFloatingIp || undefined,
      apiServerCertSans: form.apiServerCertSans || undefined,
      apiServerTlsCipherSuites: form.apiServerTlsCipherSuites || undefined,
      kubeletTlsCipherSuites: form.kubeletTlsCipherSuites || undefined,
      admissionControlList: form.admissionControlList || undefined,
      availabilityZone: form.availabilityZone || undefined,
      controlPlaneAvailabilityZones:
        form.controlPlaneAvailabilityZones || undefined,
      differentFailureDomain: form.differentFailureDomain,
      serverGroupPolicies: form.serverGroupPolicies || undefined,
      octaviaProvider: form.octaviaProvider || undefined,
      octaviaLbAlgorithm: form.octaviaLbAlgorithm || undefined,
      octaviaLbHealthcheck: form.octaviaLbHealthcheck,
      apiServerLbFlavor: form.apiServerLbFlavor || undefined,
      apiServerLbAvailabilityZone:
        form.apiServerLbAvailabilityZone || undefined,
      bootVolumeSize: optionalInteger(form.bootVolumeSize),
      bootVolumeType: form.bootVolumeType || undefined,
      bootVolumeAvailabilityZone: form.bootVolumeAvailabilityZone || undefined,
      dockerVolumeType: form.dockerVolumeType || undefined,
      etcdVolumeSize: optionalInteger(form.etcdVolumeSize),
      etcdVolumeType: form.etcdVolumeType || undefined,
      cinderCsiEnabled: form.cinderCsiEnabled,
      cinderCsiPluginTag: form.cinderCsiPluginTag || undefined,
      manilaCsiEnabled: form.manilaCsiEnabled,
      manilaCsiPluginTag: form.manilaCsiPluginTag || undefined,
      manilaCsiShareNetworkId: form.manilaCsiShareNetworkId || undefined,
      csiAttacherTag: form.csiAttacherTag || undefined,
      csiLivenessProbeTag: form.csiLivenessProbeTag || undefined,
      csiNodeDriverRegistrarTag: form.csiNodeDriverRegistrarTag || undefined,
      csiProvisionerTag: form.csiProvisionerTag || undefined,
      csiResizerTag: form.csiResizerTag || undefined,
      csiSnapshotterTag: form.csiSnapshotterTag || undefined,
      cloudProviderTag: form.cloudProviderTag || undefined,
      containerInfraPrefix: form.containerInfraPrefix || undefined,
      keystoneAuthEnabled: form.keystoneAuthEnabled,
      auditLogEnabled: form.auditLogEnabled,
      auditLogMaxAge: optionalInteger(form.auditLogMaxAge),
      auditLogMaxBackup: optionalInteger(form.auditLogMaxBackup),
      auditLogMaxSize: optionalInteger(form.auditLogMaxSize),
      oidcIssuerUrl: form.oidcIssuerUrl || undefined,
      oidcClientId: form.oidcClientId || undefined,
      oidcUsernameClaim: form.oidcUsernameClaim || undefined,
      oidcUsernamePrefix: form.oidcUsernamePrefix || undefined,
      oidcGroupsClaim: form.oidcGroupsClaim || undefined,
      oidcGroupsPrefix: form.oidcGroupsPrefix || undefined,
      httpProxy: form.httpProxy || undefined,
      httpsProxy: form.httpsProxy || undefined,
      noProxy: form.noProxy || undefined,
      customLabels: Object.fromEntries(customLabelEntries),
    };

    startTransition(async () => {
      setError(null);
      const scope = { projectId, regionId };
      const result = template
        ? await updateClusterTemplateAction(
            scope,
            template.uuid,
            input,
            template,
          )
        : await createClusterTemplateAction(scope, input);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "magnum"],
      });
      close();
      await onComplete?.(result.data);
    });
  };

  const flavorValues = flavorOptions.map((flavor) => flavor.id);
  const externalNetworkValues = externalNetworkOptions.map(
    (network) => network.id,
  );
  const networkValues = networkOptions.map((network) => network.id);
  const subnetValues = subnetOptions.map((subnet) => subnet.id);
  const volumeTypeValues = (volumeTypes.data ?? []).flatMap((type) => [
    type.id,
    type.name,
  ]);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-4xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <SheetHeader className="border-b pr-12">
            <SheetTitle>
              {editing ? "Edit cluster template" : "Create cluster template"}
            </SheetTitle>
            <SheetDescription>
              Define a reusable Kubernetes configuration for Magnum Cluster API.
            </SheetDescription>
          </SheetHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col px-4 pt-4"
            defaultValue="essentials"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-4">
              <TabsTrigger value="essentials">Essentials</TabsTrigger>
              <TabsTrigger value="networking">Networking</TabsTrigger>
              <TabsTrigger value="platform">Platform</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              <TabsContent className="space-y-7 pt-3" value="essentials">
                <Section
                  title="Identity and version"
                  description="Kubernetes versions apply to the entire cluster, including every node group."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Template name">
                      <Input
                        required
                        value={form.name}
                        onChange={(event) => update("name", event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Kubernetes version"
                      description="Use the full major.minor.patch version."
                    >
                      <Input
                        inputMode="decimal"
                        pattern="[0-9]+[.][0-9]+[.][0-9]+"
                        required
                        title="Enter a numeric major.minor.patch version, for example 1.35.4"
                        placeholder="1.35.4"
                        value={form.kubernetesVersion}
                        onChange={(event) =>
                          update("kubernetesVersion", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Node image"
                    description="Only active images with the os_distro metadata required by Magnum are shown."
                  >
                    <ImagePicker
                      images={imageOptions}
                      onValueChange={(value) => update("imageId", value)}
                      placeholder="Select an active image"
                      value={form.imageId}
                    />
                  </Field>
                </Section>

                <Section title="Compute">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Control plane flavor">
                      <Select
                        required
                        value={form.controlPlaneFlavorId}
                        onValueChange={(value) =>
                          update("controlPlaneFlavorId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a flavor" />
                        </SelectTrigger>
                        <SelectContent>
                          <CurrentValueOption
                            current={form.controlPlaneFlavorId}
                            values={flavorValues}
                          />
                          {flavorOptions.map((flavor) => (
                            <SelectItem key={flavor.id} value={flavor.id}>
                              {formatFlavorCapacity(flavor)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Worker flavor">
                      <Select
                        required
                        value={form.workerFlavorId}
                        onValueChange={(value) =>
                          update("workerFlavorId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a flavor" />
                        </SelectTrigger>
                        <SelectContent>
                          <CurrentValueOption
                            current={form.workerFlavorId}
                            values={flavorValues}
                          />
                          {flavorOptions.map((flavor) => (
                            <SelectItem key={flavor.id} value={flavor.id}>
                              {formatFlavorCapacity(flavor)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </Section>

                <Section title="Availability and operations">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ToggleRow
                      checked={form.masterLoadBalancerEnabled}
                      label="Highly available API endpoint"
                      description="Place the Kubernetes API behind an OpenStack load balancer."
                      onCheckedChange={(value) =>
                        update("masterLoadBalancerEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.apiFloatingIpEnabled}
                      label="Public API address"
                      description="Assign a floating IP to the API load balancer."
                      onCheckedChange={(value) =>
                        update("apiFloatingIpEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.autoHealingEnabled}
                      label="Automatic node healing"
                      description="Allow Cluster API machine health checks to replace unhealthy nodes."
                      onCheckedChange={(value) =>
                        update("autoHealingEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.autoScalingEnabled}
                      label="Automatic worker scaling"
                      description="Enable the cluster autoscaler for node groups with scaling bounds."
                      onCheckedChange={(value) =>
                        update("autoScalingEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.public}
                      label="Public template"
                      description="Make this template visible to other OpenStack projects."
                      onCheckedChange={(value) => update("public", value)}
                    />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-3" value="networking">
                <Section title="Pod networking">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Network driver">
                      <Select
                        value={form.networkDriver}
                        onValueChange={(value: "cilium" | "calico") =>
                          update("networkDriver", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cilium">Cilium</SelectItem>
                          <SelectItem value="calico">Calico</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label={`${form.networkDriver === "cilium" ? "Cilium" : "Calico"} image version`}
                      description="Leave empty to follow the driver release."
                    >
                      <Input
                        placeholder="Driver default"
                        value={form.cniVersion}
                        onChange={(event) =>
                          update("cniVersion", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Pod CIDR"
                      description="Leave empty to use the driver default (10.100.0.0/16)."
                    >
                      <Input
                        placeholder="10.100.0.0/16"
                        value={form.podCidr}
                        onChange={(event) =>
                          update("podCidr", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Service CIDR"
                      description="Leave empty to use the driver default (10.254.0.0/16)."
                    >
                      <Input
                        placeholder="10.254.0.0/16"
                        value={form.serviceCidr}
                        onChange={(event) =>
                          update("serviceCidr", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Cluster DNS domain"
                      description="Leave empty to use the driver default (cluster.local)."
                    >
                      <Input
                        placeholder="cluster.local"
                        value={form.clusterDomain}
                        onChange={(event) =>
                          update("clusterDomain", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  {form.networkDriver === "cilium" ? (
                    <ToggleRow
                      checked={form.ciliumHubbleUiEnabled}
                      label="Cilium Hubble UI"
                      description="Deploy Hubble Relay and the Hubble network-flow interface."
                      onCheckedChange={(value) =>
                        update("ciliumHubbleUiEnabled", value)
                      }
                    />
                  ) : null}
                </Section>

                <Section
                  title="OpenStack networks"
                  description="Leave fixed network and subnet unset to let Magnum create a dedicated tenant network."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="External network"
                      description="Required by the current Cluster API driver even when the API endpoint is private."
                    >
                      <Select
                        value={form.externalNetworkId}
                        onValueChange={(value) =>
                          update("externalNetworkId", value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an external network" />
                        </SelectTrigger>
                        <SelectContent>
                          <CurrentValueOption
                            current={form.externalNetworkId}
                            values={externalNetworkValues}
                          />
                          {externalNetworkOptions.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {optionLabel(network.name, network.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="DNS resolvers"
                      description="Optional comma-separated IPv4 addresses. Blank inherits the selected subnet's DHCP resolvers."
                    >
                      <Input
                        placeholder="1.1.1.1"
                        value={form.dnsNameserver}
                        onChange={(event) =>
                          update("dnsNameserver", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Fixed network">
                      <Select
                        value={form.fixedNetwork || "automatic"}
                        onValueChange={(value) => {
                          update(
                            "fixedNetwork",
                            value === "automatic" ? "" : value,
                          );
                          update("fixedSubnet", "");
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">
                            Create automatically
                          </SelectItem>
                          <CurrentValueOption
                            current={form.fixedNetwork}
                            values={networkValues}
                          />
                          {networkOptions.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {optionLabel(network.name, network.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Fixed subnet">
                      <Select
                        disabled={!form.fixedNetwork}
                        value={form.fixedSubnet || "automatic"}
                        onValueChange={(value) =>
                          update(
                            "fixedSubnet",
                            value === "automatic" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">
                            Select automatically
                          </SelectItem>
                          <CurrentValueOption
                            current={form.fixedSubnet}
                            values={subnetValues}
                          />
                          {subnetOptions.map((subnet) => (
                            <SelectItem key={subnet.id} value={subnet.id}>
                              {subnet.name || subnet.cidr} · {subnet.cidr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Automatically created subnet CIDR"
                      description="Used only when Magnum creates the fixed network. Leave empty for 10.0.0.0/24."
                    >
                      <Input
                        disabled={Boolean(form.fixedNetwork)}
                        placeholder="10.0.0.0/24"
                        value={form.fixedSubnetCidr}
                        onChange={(event) =>
                          update("fixedSubnetCidr", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  title="OpenStack load balancing"
                  description="Optional Octavia overrides. Blank fields follow cloud and driver defaults."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Service load balancer provider">
                      <Input
                        placeholder="amphorav2"
                        value={form.octaviaProvider}
                        onChange={(event) =>
                          update("octaviaProvider", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Service load balancer algorithm">
                      <Select
                        value={form.octaviaLbAlgorithm || "provider-default"}
                        onValueChange={(value) =>
                          update(
                            "octaviaLbAlgorithm",
                            value === "provider-default" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="provider-default">
                            Provider default
                          </SelectItem>
                          <SelectItem value="ROUND_ROBIN">
                            Round robin
                          </SelectItem>
                          <SelectItem value="LEAST_CONNECTIONS">
                            Least connections
                          </SelectItem>
                          <SelectItem value="SOURCE_IP">Source IP</SelectItem>
                          <SelectItem value="SOURCE_IP_PORT">
                            Source IP and port
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="API load balancer flavor">
                      <Input
                        placeholder="Cloud default"
                        value={form.apiServerLbFlavor}
                        onChange={(event) =>
                          update("apiServerLbFlavor", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="API load balancer availability zone">
                      <AvailabilityZoneSelect
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
                  <ToggleRow
                    checked={form.octaviaLbHealthcheck}
                    label="Service load balancer health checks"
                    description="Create Octavia health monitors for Kubernetes LoadBalancer members."
                    onCheckedChange={(value) =>
                      update("octaviaLbHealthcheck", value)
                    }
                  />
                </Section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-3" value="platform">
                <Section
                  title="Persistent node storage"
                  description="Boot and etcd volumes use Cinder. Leave values empty to inherit driver defaults; set etcd size to 0 only when you explicitly want etcd on the root disk."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Boot volume size (GiB)">
                      <Input
                        min="1"
                        type="number"
                        value={form.bootVolumeSize}
                        onChange={(event) =>
                          update("bootVolumeSize", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Boot volume type">
                      <Select
                        value={form.bootVolumeType || "cloud-default"}
                        onValueChange={(value) =>
                          update(
                            "bootVolumeType",
                            value === "cloud-default" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud-default">
                            Cloud default
                          </SelectItem>
                          <CurrentValueOption
                            current={form.bootVolumeType}
                            values={volumeTypeValues}
                          />
                          {(volumeTypes.data ?? []).map((type) => (
                            <SelectItem
                              key={type.id}
                              value={type.name || type.id}
                            >
                              {type.name || type.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Boot volume availability zone">
                      <AvailabilityZoneSelect
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
                      label="Legacy container volume type"
                      description="Used only by templates that enable Magnum's legacy container data volume."
                    >
                      <Select
                        value={form.dockerVolumeType || "cloud-default"}
                        onValueChange={(value) =>
                          update(
                            "dockerVolumeType",
                            value === "cloud-default" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud-default">
                            Cloud default
                          </SelectItem>
                          <CurrentValueOption
                            current={form.dockerVolumeType}
                            values={volumeTypeValues}
                          />
                          {(volumeTypes.data ?? []).map((type) => (
                            <SelectItem
                              key={type.id}
                              value={type.name || type.id}
                            >
                              {type.name || type.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="etcd volume size (GiB)">
                      <Input
                        min="0"
                        type="number"
                        value={form.etcdVolumeSize}
                        onChange={(event) =>
                          update("etcdVolumeSize", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="etcd volume type">
                      <Select
                        value={form.etcdVolumeType || "cloud-default"}
                        onValueChange={(value) =>
                          update(
                            "etcdVolumeType",
                            value === "cloud-default" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud-default">
                            Cloud default
                          </SelectItem>
                          <CurrentValueOption
                            current={form.etcdVolumeType}
                            values={volumeTypeValues}
                          />
                          {(volumeTypes.data ?? []).map((type) => (
                            <SelectItem
                              key={type.id}
                              value={type.name || type.id}
                            >
                              {type.name || type.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ToggleRow
                      checked={form.cinderCsiEnabled}
                      label="Cinder CSI"
                      description="Provide Kubernetes persistent volumes backed by Cinder."
                      onCheckedChange={(value) =>
                        update("cinderCsiEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.manilaCsiEnabled}
                      label="Manila CSI"
                      description="Expose OpenStack shared file systems to workloads."
                      onCheckedChange={(value) => {
                        update("manilaCsiEnabled", value);
                        if (!value) update("manilaCsiShareNetworkId", "");
                      }}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Cinder CSI image version"
                      description="Leave empty to select a compatible version from kube_tag."
                    >
                      <Input
                        disabled={!form.cinderCsiEnabled}
                        placeholder="Selected from Kubernetes version"
                        value={form.cinderCsiPluginTag}
                        onChange={(event) =>
                          update("cinderCsiPluginTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Manila CSI image version"
                      description="Leave empty to select a compatible version from kube_tag."
                    >
                      <Input
                        disabled={!form.manilaCsiEnabled}
                        placeholder="Selected from Kubernetes version"
                        value={form.manilaCsiPluginTag}
                        onChange={(event) =>
                          update("manilaCsiPluginTag", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="font-medium">
                      Share network selected per cluster
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manila share-network IDs are project scoped, so private
                      and public templates do not select one. Choose the share
                      network when creating each cluster. Existing template
                      values are preserved when editing.
                    </p>
                  </div>
                </Section>

                <Section title="Identity and audit">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ToggleRow
                      checked={form.keystoneAuthEnabled}
                      label="Keystone authentication"
                      description="Install the OpenStack Keystone webhook integration."
                      onCheckedChange={(value) =>
                        update("keystoneAuthEnabled", value)
                      }
                    />
                    <ToggleRow
                      checked={form.auditLogEnabled}
                      label="Kubernetes audit log"
                      description="Persist API audit events on control-plane nodes."
                      onCheckedChange={(value) =>
                        update("auditLogEnabled", value)
                      }
                    />
                  </div>
                  {form.auditLogEnabled ? (
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Maximum age (days)">
                        <Input
                          min="0"
                          placeholder="30"
                          type="number"
                          value={form.auditLogMaxAge}
                          onChange={(event) =>
                            update("auditLogMaxAge", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Backup files">
                        <Input
                          min="0"
                          placeholder="10"
                          type="number"
                          value={form.auditLogMaxBackup}
                          onChange={(event) =>
                            update("auditLogMaxBackup", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="File size (MiB)">
                        <Input
                          min="1"
                          placeholder="100"
                          type="number"
                          value={form.auditLogMaxSize}
                          onChange={(event) =>
                            update("auditLogMaxSize", event.target.value)
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </Section>

                <Section
                  title="Kubernetes API security"
                  description="Advanced API and kubelet policy overrides. Leave values empty to retain the driver's secure defaults."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Additional admission plugins"
                      description="NodeRestriction is always enabled by the driver."
                    >
                      <Input
                        placeholder="PodSecurity"
                        value={form.admissionControlList}
                        onChange={(event) =>
                          update("admissionControlList", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="API server TLS cipher suites">
                    <Textarea
                      className="min-h-20 font-mono text-xs"
                      placeholder="Driver secure defaults"
                      value={form.apiServerTlsCipherSuites}
                      onChange={(event) =>
                        update("apiServerTlsCipherSuites", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Kubelet TLS cipher suites">
                    <Textarea
                      className="min-h-20 font-mono text-xs"
                      placeholder="Driver secure defaults"
                      value={form.kubeletTlsCipherSuites}
                      onChange={(event) =>
                        update("kubeletTlsCipherSuites", event.target.value)
                      }
                    />
                  </Field>
                </Section>
              </TabsContent>

              <TabsContent className="space-y-7 pt-3" value="advanced">
                <Section title="Placement">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Default availability zone">
                      <AvailabilityZoneSelect
                        defaultLabel="Cloud scheduler"
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
                      label="Control plane availability zones"
                      description="Select one or more Nova zones used for control-plane placement."
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
                    <Field
                      label="Server group policies"
                      description="Comma-separated Nova policies. Leave empty for soft-anti-affinity."
                    >
                      <Input
                        placeholder="soft-anti-affinity"
                        value={form.serverGroupPolicies}
                        onChange={(event) =>
                          update("serverGroupPolicies", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <ToggleRow
                    checked={form.differentFailureDomain}
                    label="Different failure domains"
                    description="Use the VEXXHOST Nova scheduler filter to spread machines across failure domains."
                    onCheckedChange={(value) =>
                      update("differentFailureDomain", value)
                    }
                  />
                </Section>

                <Section
                  title="Component image overrides"
                  description="These values pin driver-managed components. Blank values follow the tested versions shipped with magnum-cluster-api."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Container image repository">
                      <Input
                        placeholder="Upstream registries"
                        value={form.containerInfraPrefix}
                        onChange={(event) =>
                          update("containerInfraPrefix", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="OpenStack cloud controller version">
                      <Input
                        placeholder="Selected from Kubernetes version"
                        value={form.cloudProviderTag}
                        onChange={(event) =>
                          update("cloudProviderTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="CSI attacher version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiAttacherTag}
                        onChange={(event) =>
                          update("csiAttacherTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="CSI liveness probe version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiLivenessProbeTag}
                        onChange={(event) =>
                          update("csiLivenessProbeTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="CSI node registrar version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiNodeDriverRegistrarTag}
                        onChange={(event) =>
                          update(
                            "csiNodeDriverRegistrarTag",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="CSI provisioner version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiProvisionerTag}
                        onChange={(event) =>
                          update("csiProvisionerTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="CSI resizer version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiResizerTag}
                        onChange={(event) =>
                          update("csiResizerTag", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="CSI snapshotter version">
                      <Input
                        placeholder="Driver default"
                        value={form.csiSnapshotterTag}
                        onChange={(event) =>
                          update("csiSnapshotterTag", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </Section>

                <Section title="Proxy configuration">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="HTTP proxy">
                      <Input
                        value={form.httpProxy}
                        onChange={(event) =>
                          update("httpProxy", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="HTTPS proxy">
                      <Input
                        value={form.httpsProxy}
                        onChange={(event) =>
                          update("httpsProxy", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="No proxy">
                      <Input
                        value={form.noProxy}
                        onChange={(event) =>
                          update("noProxy", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  title="Custom driver labels"
                  description="Unknown magnum-cluster-api labels are preserved during edits. Values are sent as strings."
                >
                  <div className="space-y-2">
                    {customLabels.map((label, index) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
                        key={label.id}
                      >
                        <Input
                          aria-label={`Custom label ${index + 1} key`}
                          placeholder="Label key"
                          value={label.key}
                          onChange={(event) =>
                            updateCustomLabel(index, "key", event.target.value)
                          }
                        />
                        <Input
                          aria-label={`Custom label ${index + 1} value`}
                          placeholder="Value"
                          value={label.value}
                          onChange={(event) =>
                            updateCustomLabel(
                              index,
                              "value",
                              event.target.value,
                            )
                          }
                        />
                        <Button
                          aria-label={`Remove custom label ${index + 1}`}
                          onClick={() =>
                            setCustomLabels((current) =>
                              current.filter(
                                (_, labelIndex) => labelIndex !== index,
                              ),
                            )
                          }
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      onClick={addCustomLabel}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus className="size-4" />
                      Add label
                    </Button>
                  </div>
                </Section>
              </TabsContent>
            </div>
          </Tabs>

          <SheetFooter className="border-t bg-background">
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <div className="flex justify-end gap-2">
              <Button
                disabled={isPending}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending
                  ? editing
                    ? "Saving"
                    : "Creating"
                  : editing
                    ? "Save changes"
                    : "Create template"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
