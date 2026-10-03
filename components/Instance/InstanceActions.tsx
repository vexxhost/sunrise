"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive,
  Image as ImageIcon,
  Plus,
  Server,
  Trash2,
} from "lucide-react";

import { ImagePicker } from "@/components/Image/ImageSelectOption";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  WizardDialog,
  WizardDialogContent,
  WizardDialogDescription,
  WizardDialogFooter,
  WizardDialogHeader,
  WizardReviewStatus,
  WizardDialogTitle,
  WizardReviewRow,
} from "@/components/ui/wizard-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import {
  networksQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  flavorsQueryOptions,
  keypairsQueryOptions,
  serverAvailabilityZonesQueryOptions,
} from "@/hooks/queries/useServers";
import {
  volumesQueryOptions,
  volumeTypesQueryOptions,
} from "@/hooks/queries/useVolumes";
import {
  projectQuotaQueryOptions,
  quotaQueryUnavailableMessage,
} from "@/hooks/queries/useQuotas";
import { formatFlavorCapacity } from "@/lib/openstack/flavor";
import {
  cinderVolumeQuotaImpacts,
  novaQuotaImpacts,
  quotaImpactIssues,
  quotaUnavailableReason,
} from "@/lib/openstack/quota-impact";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { createServerAction } from "@/lib/openstack/nova-actions";
import { normalizeMutationProjectId } from "@/lib/mutations";
import type {
  Flavor,
  Image,
  Keypair,
  Network,
  SecurityGroup,
  ComputeAvailabilityZone,
  Volume,
} from "@/types/openstack";

interface InstanceActionsProps {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}

type MetadataEntry = { id: number; key: string; value: string };
type BootSource = "image" | "image-volume" | "volume";

interface LaunchFormState {
  name: string;
  description: string;
  count: string;
  bootSource: BootSource;
  imageRef: string;
  volumeRef: string;
  bootVolumeSize: string;
  bootVolumeType: string;
  deleteOnTermination: boolean;
  flavorRef: string;
  keyName: string;
  networkIds: string[];
  securityGroupNames: string[];
  availabilityZone: string;
  metadata: MetadataEntry[];
  userData: string;
  configDrive: boolean;
}

const INITIAL_FORM: LaunchFormState = {
  name: "",
  description: "",
  count: "1",
  bootSource: "image",
  imageRef: "",
  volumeRef: "",
  bootVolumeSize: "1",
  bootVolumeType: "default",
  deleteOnTermination: false,
  flavorRef: "",
  keyName: "none",
  networkIds: [],
  securityGroupNames: [],
  availabilityZone: "",
  metadata: [],
  userData: "",
  configDrive: false,
};

const SCHEDULER_DEFAULT_ZONE = "scheduler-default";

function minimumBootVolumeSize(image: Image | undefined) {
  if (!image) return 1;
  const virtualSizeGiB = image.virtual_size
    ? Math.ceil(image.virtual_size / 1024 ** 3)
    : 0;
  return Math.max(1, image.min_disk || 0, virtualSizeGiB);
}

function isBootableVolume(volume: Volume) {
  return (
    volume.status === "available" &&
    String(volume.bootable).toLowerCase() === "true"
  );
}

function metadataRecord(entries: MetadataEntry[]) {
  return Object.fromEntries(
    entries
      .map(({ key, value }) => [key.trim(), value] as const)
      .filter(([key]) => key),
  );
}

function projectNetworks(networks: Network[], projectId?: string) {
  const activeProject = normalizeMutationProjectId(projectId);
  return networks
    .filter(
      (network) =>
        normalizeMutationProjectId(network.project_id) === activeProject ||
        network.shared,
    )
    .sort((left, right) => {
      const leftOwned =
        normalizeMutationProjectId(left.project_id) === activeProject;
      const rightOwned =
        normalizeMutationProjectId(right.project_id) === activeProject;
      return (
        Number(rightOwned) - Number(leftOwned) ||
        left.name.localeCompare(right.name)
      );
    });
}

function projectSecurityGroups(
  securityGroups: SecurityGroup[],
  projectId?: string,
) {
  const activeProject = normalizeMutationProjectId(projectId);
  return securityGroups.filter(
    (group) => normalizeMutationProjectId(group.project_id) === activeProject,
  );
}

export function InstanceActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: InstanceActionsProps) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState<LaunchFormState>(INITIAL_FORM);
  const [nextMetadataId, setNextMetadataId] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([]);
  const [keypairs, setKeypairs] = useState<Keypair[]>([]);
  const [availabilityZones, setAvailabilityZones] = useState<
    ComputeAvailabilityZone[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(initiallyOpen);
  const [isPending, startTransition] = useTransition();
  const volumeTypes = useQuery({
    ...volumeTypesQueryOptions(regionId, projectId),
    enabled: isOpen && Boolean(regionId && projectId),
  });
  const volumes = useQuery({
    ...volumesQueryOptions(regionId, projectId),
    enabled: isOpen && Boolean(regionId && projectId),
  });
  const quota = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, "compute"),
    enabled: isOpen && Boolean(regionId && projectId),
  });
  const storageQuota = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, "storage"),
    enabled:
      isOpen &&
      form.bootSource === "image-volume" &&
      Boolean(regionId && projectId),
  });
  const visibleNetworks = useMemo(
    () => projectNetworks(networks, projectId),
    [networks, projectId],
  );
  const visibleSecurityGroups = useMemo(
    () => projectSecurityGroups(securityGroups, projectId),
    [projectId, securityGroups],
  );
  const selectedImage = images.find(({ id }) => id === form.imageRef);
  const selectedVolumeType = (volumeTypes.data ?? []).find(
    ({ id }) => id === form.bootVolumeType,
  );
  const eligibleVolumes = useMemo(
    () => (volumes.data ?? []).filter(isBootableVolume),
    [volumes.data],
  );
  const selectedVolume = eligibleVolumes.find(
    ({ id }) => id === form.volumeRef,
  );
  const selectedFlavor = flavors.find(
    ({ id }) => String(id) === form.flavorRef,
  );
  const count = Number(form.count);
  const bootVolumeSize = Number(form.bootVolumeSize);
  const minimumVolumeSize = minimumBootVolumeSize(selectedImage);
  const configuredMetadata = form.metadata.filter(({ key }) => key.trim());
  const configuredMetadataCount = configuredMetadata.length;
  const quotaMetrics = useMemo(
    () => (quota.data?.status === "available" ? quota.data.metrics : []),
    [quota.data],
  );
  const quotaImpacts = useMemo(
    () =>
      novaQuotaImpacts(
        quotaMetrics,
        selectedFlavor,
        count,
        configuredMetadataCount,
      ),
    [configuredMetadataCount, count, quotaMetrics, selectedFlavor],
  );
  const computeQuotaIssues = useMemo(
    () => quotaImpactIssues(quotaImpacts),
    [quotaImpacts],
  );
  const quotaUnavailableMessage = quotaQueryUnavailableMessage(
    quota,
    "Compute quotas are unavailable. Nova will validate the request when it is submitted.",
  );
  const storageQuotaMetrics = useMemo(
    () =>
      storageQuota.data?.status === "available"
        ? storageQuota.data.metrics
        : [],
    [storageQuota.data],
  );
  const storageQuotaImpacts = useMemo(
    () =>
      form.bootSource === "image-volume"
        ? cinderVolumeQuotaImpacts(
            storageQuotaMetrics,
            bootVolumeSize,
            selectedVolumeType?.name,
            count,
          )
        : [],
    [
      bootVolumeSize,
      count,
      form.bootSource,
      selectedVolumeType?.name,
      storageQuotaMetrics,
    ],
  );
  const storageQuotaIssues = useMemo(
    () => quotaImpactIssues(storageQuotaImpacts),
    [storageQuotaImpacts],
  );
  const storageQuotaUnavailableMessage = quotaQueryUnavailableMessage(
    storageQuota,
    "Block Storage quotas are unavailable. Cinder will validate the boot volume request when it is submitted.",
  );
  const volumeTypeQuotaReasons = useMemo(
    () =>
      new Map(
        (volumeTypes.data ?? []).map((volumeType) => {
          const reason = quotaUnavailableReason(
            cinderVolumeQuotaImpacts(
              storageQuotaMetrics,
              bootVolumeSize,
              volumeType.name,
              count,
            ),
          );
          return [
            volumeType.id,
            reason ? `Insufficient ${reason} quota` : null,
          ];
        }),
      ),
    [bootVolumeSize, count, storageQuotaMetrics, volumeTypes.data],
  );
  const flavorQuotaReasons = useMemo(
    () =>
      new Map(
        flavors.map((flavor) => {
          if (flavor["OS-FLV-DISABLED:disabled"]) {
            return [String(flavor.id), "Disabled by the cloud operator"];
          }
          const reason = quotaUnavailableReason(
            novaQuotaImpacts(quotaMetrics, flavor, count),
          );
          return [
            String(flavor.id),
            reason ? `Insufficient ${reason} quota` : null,
          ];
        }),
      ),
    [count, flavors, quotaMetrics],
  );
  const reviewIssues = useMemo(() => {
    const issues: string[] = [];
    if (!form.name.trim()) issues.push("Enter an instance name.");
    if (form.bootSource === "volume") {
      if (!form.volumeRef) issues.push("Select an existing boot volume.");
      if (count !== 1) {
        issues.push("An existing boot volume can launch only one instance.");
      }
    } else if (!form.imageRef) {
      issues.push("Select a source image.");
    }
    if (
      form.bootSource === "image-volume" &&
      (!Number.isInteger(bootVolumeSize) || bootVolumeSize < minimumVolumeSize)
    ) {
      issues.push(
        `Enter a boot volume size of at least ${minimumVolumeSize} GiB.`,
      );
    }
    if (!form.flavorRef) issues.push("Select an instance flavor.");
    if (!Number.isInteger(count) || count < 1) {
      issues.push("Enter an instance count of at least 1.");
    }
    issues.push(...computeQuotaIssues, ...storageQuotaIssues);
    return issues;
  }, [
    bootVolumeSize,
    computeQuotaIssues,
    count,
    form.bootSource,
    form.flavorRef,
    form.imageRef,
    form.name,
    form.volumeRef,
    minimumVolumeSize,
    storageQuotaIssues,
  ]);

  const loadOptions = useCallback(async () => {
    try {
      const [
        nextImages,
        nextFlavors,
        nextNetworks,
        nextSecurityGroups,
        nextKeypairs,
        nextAvailabilityZones,
      ] = await Promise.all([
        queryClient.fetchQuery(imagesQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(flavorsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(networksQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(securityGroupsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(keypairsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(
          serverAvailabilityZonesQueryOptions(regionId, projectId),
        ),
      ]);
      const scopedNetworks = projectNetworks(nextNetworks, projectId);
      const scopedSecurityGroups = projectSecurityGroups(
        nextSecurityGroups,
        projectId,
      );
      const defaultSecurityGroup = scopedSecurityGroups.find(
        ({ name }) => name === "default",
      );

      setImages(nextImages);
      setFlavors(nextFlavors);
      setNetworks(nextNetworks);
      setSecurityGroups(nextSecurityGroups);
      setKeypairs(nextKeypairs);
      setAvailabilityZones(nextAvailabilityZones);
      setForm((current) => ({
        ...current,
        networkIds: scopedNetworks[0]?.id ? [scopedNetworks[0].id] : [],
        securityGroupNames: defaultSecurityGroup
          ? [defaultSecurityGroup.name]
          : [],
      }));
    } catch {
      setErrorMessage("Unable to load launch options. Refresh and try again.");
    } finally {
      setOptionsLoading(false);
    }
  }, [projectId, queryClient, regionId]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setErrorMessage(null);
        setActiveTab("details");
        setIsOpen(false);
        clearCreateActionIntent();
        return;
      }

      setIsOpen(open);
      setForm(INITIAL_FORM);
      setActiveTab("details");
      setNextMetadataId(1);
      setErrorMessage(null);
      setOptionsLoading(true);
      void loadOptions();
    },
    [clearCreateActionIntent, loadOptions],
  );

  useEffect(() => {
    if (initiallyOpen) void loadOptions();
  }, [initiallyOpen, loadOptions]);

  const toggleString = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

  const setBootSource = (bootSource: BootSource) => {
    setForm((current) => ({
      ...current,
      bootSource,
      count: bootSource === "volume" ? "1" : current.count,
      bootVolumeSize:
        bootSource === "image-volume"
          ? String(
              Math.max(
                Number(current.bootVolumeSize) || 0,
                minimumBootVolumeSize(
                  images.find(({ id }) => id === current.imageRef),
                ),
              ),
            )
          : current.bootVolumeSize,
    }));
  };

  const setImageRef = (imageRef: string) => {
    const minimumSize = minimumBootVolumeSize(
      images.find(({ id }) => id === imageRef),
    );
    setForm((current) => ({
      ...current,
      imageRef,
      bootVolumeSize:
        current.bootSource === "image-volume"
          ? String(Math.max(Number(current.bootVolumeSize) || 0, minimumSize))
          : current.bootVolumeSize,
    }));
  };

  const addMetadata = () => {
    setForm((current) => ({
      ...current,
      metadata: [
        ...current.metadata,
        { id: nextMetadataId, key: "", value: "" },
      ],
    }));
    setNextMetadataId((value) => value + 1);
  };

  const updateMetadata = (
    id: number,
    field: "key" | "value",
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      metadata: current.metadata.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeTab !== "review") {
      setActiveTab("review");
      return;
    }
    if (reviewIssues.length || !projectId || !regionId) return;

    startTransition(async () => {
      setErrorMessage(null);
      const sourceInput =
        form.bootSource === "image"
          ? {
              bootSource: "image" as const,
              imageRef: form.imageRef,
            }
          : form.bootSource === "image-volume"
            ? {
                bootSource: "image-volume" as const,
                imageRef: form.imageRef,
                volumeSize: Number(form.bootVolumeSize),
                volumeType:
                  form.bootVolumeType === "default"
                    ? undefined
                    : form.bootVolumeType,
                deleteOnTermination: form.deleteOnTermination,
              }
            : {
                bootSource: "volume" as const,
                volumeRef: form.volumeRef,
                deleteOnTermination: form.deleteOnTermination,
              };
      const result = await createServerAction(
        { projectId, regionId },
        {
          name: form.name,
          description: form.description || undefined,
          count: Number(form.count),
          flavorRef: form.flavorRef,
          keyName: form.keyName === "none" ? undefined : form.keyName,
          networkIds: form.networkIds,
          securityGroupNames: form.securityGroupNames,
          availabilityZone: form.availabilityZone || undefined,
          metadata: metadataRecord(form.metadata),
          userData: form.userData || undefined,
          configDrive: form.configDrive,
          ...sourceInput,
        },
      );

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      handleOpenChange(false);
      setForm(INITIAL_FORM);
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "servers"],
      });
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "project-quotas", "compute"],
      });
      if (form.bootSource !== "image") {
        void queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volumes"],
        });
      }
      if (form.bootSource === "volume") {
        void queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volume", form.volumeRef],
        });
      }
      if (form.bootSource === "image-volume") {
        void queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "project-quotas", "storage"],
        });
      }
    });
  };

  const selectedNetworkNames = visibleNetworks
    .filter(({ id }) => form.networkIds.includes(id))
    .map(({ id, name }) => name || id);

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => handleOpenChange(true)}
        title={
          projectId && regionId
            ? "Launch an instance"
            : "Select a project and region first"
        }
      >
        <Plus className="size-4" />
        Launch instance
      </Button>

      <WizardDialog open={isOpen} onOpenChange={handleOpenChange}>
        <WizardDialogContent>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <WizardDialogHeader>
              <WizardDialogTitle className="flex items-center gap-2">
                <Server className="size-5" />
                Launch instance
              </WizardDialogTitle>
              <WizardDialogDescription>
                Configure identity, source, capacity, and project connectivity.
              </WizardDialogDescription>
            </WizardDialogHeader>

            <Tabs
              className="flex min-h-0 flex-1 flex-col px-4 pt-4"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-5">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
                <TabsTrigger value="networking">
                  Network &amp; security
                </TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                <TabsContent className="space-y-7 pt-3" value="details">
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">Identity</h3>
                      <p className="text-xs text-muted-foreground">
                        Name the server or the numbered group created from this
                        configuration.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-name">Name</Label>
                        <Input
                          id="launch-name"
                          autoFocus
                          maxLength={255}
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          disabled={isPending}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-count">Instance count</Label>
                        <Input
                          id="launch-count"
                          min={1}
                          step={1}
                          type="number"
                          value={form.count}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              count: event.target.value,
                            }))
                          }
                          disabled={isPending || form.bootSource === "volume"}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          {form.bootSource === "volume"
                            ? "An existing boot volume can be attached to one new instance."
                            : "Nova creates this many instances with identical settings, subject to project quota."}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="launch-description">Description</Label>
                      <Textarea
                        id="launch-description"
                        className="min-h-24"
                        maxLength={255}
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        disabled={isPending}
                        placeholder="Optional purpose or workload context"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="launch-az">Availability zone</Label>
                      <Select
                        value={form.availabilityZone || SCHEDULER_DEFAULT_ZONE}
                        onValueChange={(availabilityZone) =>
                          setForm((current) => ({
                            ...current,
                            availabilityZone:
                              availabilityZone === SCHEDULER_DEFAULT_ZONE
                                ? ""
                                : availabilityZone,
                          }))
                        }
                        disabled={optionsLoading || isPending}
                      >
                        <SelectTrigger className="w-full" id="launch-az">
                          <SelectValue placeholder="Use the scheduler default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SCHEDULER_DEFAULT_ZONE}>
                            Scheduler default
                          </SelectItem>
                          {availabilityZones.map((zone) => (
                            <SelectItem
                              key={zone.zoneName}
                              value={zone.zoneName}
                            >
                              {zone.zoneName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Leave the scheduler default selected unless placement in
                        a specific compute zone is required.
                      </p>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent className="space-y-7 pt-3" value="source">
                  <section className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Boot source and capacity
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Choose where the root disk lives, then select the
                        operating system or existing bootable volume.
                      </p>
                    </div>
                    <RadioGroup
                      className="grid gap-3 md:grid-cols-3"
                      value={form.bootSource}
                      onValueChange={(value) =>
                        setBootSource(value as BootSource)
                      }
                      disabled={isPending}
                    >
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${form.bootSource === "image" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                        htmlFor="boot-source-image"
                      >
                        <RadioGroupItem
                          className="mt-0.5"
                          id="boot-source-image"
                          value="image"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <ImageIcon className="size-4" aria-hidden="true" />
                            Local image disk
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Boot from an image on the flavor&apos;s local root
                            disk.
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${form.bootSource === "image-volume" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                        htmlFor="boot-source-image-volume"
                      >
                        <RadioGroupItem
                          className="mt-0.5"
                          id="boot-source-image-volume"
                          value="image-volume"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <HardDrive className="size-4" aria-hidden="true" />
                            New boot volume
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Create an image-backed Cinder volume for each
                            instance.
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${form.bootSource === "volume" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                        htmlFor="boot-source-volume"
                      >
                        <RadioGroupItem
                          className="mt-0.5"
                          id="boot-source-volume"
                          value="volume"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <HardDrive className="size-4" aria-hidden="true" />
                            Existing boot volume
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Attach one available bootable volume as the root
                            disk.
                          </span>
                        </span>
                      </label>
                    </RadioGroup>

                    {form.bootSource === "volume" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-volume">Boot volume</Label>
                        <Select
                          value={form.volumeRef}
                          onValueChange={(volumeRef) =>
                            setForm((current) => ({ ...current, volumeRef }))
                          }
                          disabled={volumes.isLoading || isPending}
                        >
                          <SelectTrigger className="w-full" id="launch-volume">
                            <SelectValue
                              placeholder={
                                volumes.isLoading
                                  ? "Loading bootable volumes"
                                  : "Choose a bootable volume"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleVolumes.map((volume) => (
                              <SelectItem
                                key={volume.id}
                                value={volume.id}
                                textValue={`${volume.name || volume.id} ${volume.id}`}
                                className="py-2"
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">
                                    {volume.name || "Unnamed volume"} ·{" "}
                                    {volume.size} GiB
                                  </span>
                                  <span className="truncate font-mono text-xs text-muted-foreground">
                                    {volume.id}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Only unattached volumes marked bootable by Cinder are
                          available. Existing volumes do not consume new storage
                          quota.
                        </p>
                        {volumes.isError ? (
                          <MutationAlert>
                            Unable to load bootable volumes. Refresh and try
                            again.
                          </MutationAlert>
                        ) : !volumes.isLoading && !eligibleVolumes.length ? (
                          <p className="text-sm text-muted-foreground">
                            No available bootable volumes were found in this
                            project.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-image">Image</Label>
                        <ImagePicker
                          disabled={optionsLoading || isPending}
                          id="launch-image"
                          images={images}
                          onValueChange={setImageRef}
                          placeholder={
                            optionsLoading
                              ? "Loading images"
                              : "Choose an image"
                          }
                          value={form.imageRef}
                        />
                      </div>
                    )}

                    {form.bootSource === "image-volume" ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="launch-boot-volume-size">
                            Boot volume size (GiB)
                          </Label>
                          <Input
                            id="launch-boot-volume-size"
                            min={minimumVolumeSize}
                            step={1}
                            type="number"
                            value={form.bootVolumeSize}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                bootVolumeSize: event.target.value,
                              }))
                            }
                            disabled={isPending}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            The selected image requires at least{" "}
                            {minimumVolumeSize} GiB.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="launch-boot-volume-type">
                            Volume type
                          </Label>
                          <Select
                            value={form.bootVolumeType}
                            onValueChange={(bootVolumeType) =>
                              setForm((current) => ({
                                ...current,
                                bootVolumeType,
                              }))
                            }
                            disabled={volumeTypes.isLoading || isPending}
                          >
                            <SelectTrigger
                              className="w-full"
                              id="launch-boot-volume-type"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">
                                Project default
                              </SelectItem>
                              {(volumeTypes.data ?? []).map((volumeType) => {
                                const reason = volumeTypeQuotaReasons.get(
                                  volumeType.id,
                                );
                                return (
                                  <SelectItem
                                    key={volumeType.id}
                                    value={volumeType.id}
                                    textValue={volumeType.name}
                                    disabled={Boolean(reason)}
                                    className="py-2"
                                  >
                                    <span className="flex min-w-0 flex-col">
                                      <span className="truncate">
                                        {volumeType.name}
                                      </span>
                                      {reason ? (
                                        <span className="truncate text-xs text-status-danger">
                                          {reason}
                                        </span>
                                      ) : volumeType.description ? (
                                        <span className="truncate text-xs text-muted-foreground">
                                          {volumeType.description}
                                        </span>
                                      ) : null}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}

                    {form.bootSource !== "image" ? (
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <Checkbox
                          checked={form.deleteOnTermination}
                          onCheckedChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              deleteOnTermination: Boolean(value),
                            }))
                          }
                          disabled={isPending}
                        />
                        <span>
                          Delete the boot volume when the instance is deleted
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Leave disabled to preserve the volume independently
                            of the instance lifecycle.
                          </span>
                        </span>
                      </label>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label htmlFor="launch-flavor">Flavor</Label>
                      <Select
                        value={form.flavorRef}
                        onValueChange={(flavorRef) =>
                          setForm((current) => ({ ...current, flavorRef }))
                        }
                        disabled={optionsLoading || isPending}
                        required
                      >
                        <SelectTrigger className="w-full" id="launch-flavor">
                          <SelectValue
                            placeholder={
                              optionsLoading
                                ? "Loading flavors"
                                : "Choose capacity"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {flavors.map((flavor) => {
                            const reason = flavorQuotaReasons.get(
                              String(flavor.id),
                            );
                            return (
                              <SelectItem
                                key={flavor.id}
                                value={String(flavor.id)}
                                textValue={formatFlavorCapacity(flavor)}
                                disabled={Boolean(reason)}
                                className="py-2"
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">
                                    {formatFlavorCapacity(flavor)}
                                  </span>
                                  {reason ? (
                                    <span className="truncate text-xs text-status-danger">
                                      {reason}
                                    </span>
                                  ) : null}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <QuotaImpactPreview
                      impacts={quotaImpacts}
                      loading={quota.isLoading}
                      unavailableMessage={quotaUnavailableMessage}
                      title="Compute quota impact"
                    />
                    {form.bootSource === "image-volume" ? (
                      <QuotaImpactPreview
                        impacts={storageQuotaImpacts}
                        loading={storageQuota.isLoading}
                        unavailableMessage={storageQuotaUnavailableMessage}
                        title="Block Storage quota impact"
                        description="Nova creates one boot volume per instance. The request must fit aggregate, per-volume, and selected volume-type limits."
                      />
                    ) : null}
                  </section>
                </TabsContent>

                <TabsContent className="space-y-7 pt-3" value="networking">
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Network &amp; security
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Attach project networks, apply security groups, and
                        choose the SSH key installed at boot.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="launch-keypair">Key pair</Label>
                      <Select
                        value={form.keyName}
                        onValueChange={(keyName) =>
                          setForm((current) => ({ ...current, keyName }))
                        }
                        disabled={optionsLoading || isPending}
                      >
                        <SelectTrigger className="w-full" id="launch-keypair">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No key pair</SelectItem>
                          {keypairs.map((keypair) => (
                            <SelectItem key={keypair.name} value={keypair.name}>
                              {keypair.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Networks</Label>
                        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                          {optionsLoading ? (
                            <p className="px-2 py-1 text-sm text-muted-foreground">
                              Loading networks.
                            </p>
                          ) : visibleNetworks.length ? (
                            visibleNetworks.map((network) => (
                              <label
                                key={network.id}
                                className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  checked={form.networkIds.includes(network.id)}
                                  onCheckedChange={() =>
                                    setForm((current) => ({
                                      ...current,
                                      networkIds: toggleString(
                                        current.networkIds,
                                        network.id,
                                      ),
                                    }))
                                  }
                                  disabled={isPending}
                                />
                                <span className="truncate">
                                  {network.name || network.id}
                                </span>
                              </label>
                            ))
                          ) : (
                            <p className="px-2 py-1 text-sm text-muted-foreground">
                              No project networks are available.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Security groups</Label>
                        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                          {optionsLoading ? (
                            <p className="px-2 py-1 text-sm text-muted-foreground">
                              Loading security groups.
                            </p>
                          ) : visibleSecurityGroups.length ? (
                            visibleSecurityGroups.map((group) => (
                              <label
                                key={group.id}
                                className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  checked={form.securityGroupNames.includes(
                                    group.name,
                                  )}
                                  onCheckedChange={() =>
                                    setForm((current) => ({
                                      ...current,
                                      securityGroupNames: toggleString(
                                        current.securityGroupNames,
                                        group.name,
                                      ),
                                    }))
                                  }
                                  disabled={isPending}
                                />
                                <span className="truncate">{group.name}</span>
                              </label>
                            ))
                          ) : (
                            <p className="px-2 py-1 text-sm text-muted-foreground">
                              No security groups are available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent className="space-y-7 pt-3" value="advanced">
                  <section className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Guest configuration
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Pass workload metadata and initialization data to every
                        server in this launch.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Metadata</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addMetadata}
                        >
                          <Plus className="size-4" />
                          Add metadata
                        </Button>
                      </div>
                      {form.metadata.length ? (
                        <div className="space-y-2">
                          {form.metadata.map((entry) => (
                            <div
                              key={entry.id}
                              className="grid grid-cols-[1fr_1fr_auto] gap-2"
                            >
                              <Input
                                aria-label="Metadata key"
                                placeholder="Key"
                                maxLength={255}
                                value={entry.key}
                                onChange={(event) =>
                                  updateMetadata(
                                    entry.id,
                                    "key",
                                    event.target.value,
                                  )
                                }
                              />
                              <Input
                                aria-label="Metadata value"
                                placeholder="Value"
                                maxLength={255}
                                value={entry.value}
                                onChange={(event) =>
                                  updateMetadata(
                                    entry.id,
                                    "value",
                                    event.target.value,
                                  )
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remove metadata"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    metadata: current.metadata.filter(
                                      (item) => item.id !== entry.id,
                                    ),
                                  }))
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No metadata added.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="launch-userdata">User data</Label>
                      <Textarea
                        id="launch-userdata"
                        className="min-h-36 font-mono text-xs"
                        value={form.userData}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            userData: event.target.value,
                          }))
                        }
                        disabled={isPending}
                        placeholder="#cloud-config"
                      />
                      <p className="text-xs text-muted-foreground">
                        Sunrise encodes this value for Nova after server-side
                        validation.
                      </p>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.configDrive}
                        onCheckedChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            configDrive: Boolean(value),
                          }))
                        }
                        disabled={isPending}
                      />
                      Provide metadata and user data through a config drive
                    </label>
                  </section>
                </TabsContent>

                <TabsContent className="space-y-5 pt-3" value="review">
                  <WizardReviewStatus issues={reviewIssues} />
                  <div>
                    <h3 className="text-sm font-semibold">Review instance</h3>
                    <p className="text-xs text-muted-foreground">
                      Confirm the instance configuration before asking Nova to
                      create resources.
                    </p>
                  </div>
                  <dl className="rounded-md border px-4">
                    <WizardReviewRow label="Name" value={form.name || "-"} />
                    <WizardReviewRow
                      label="Instance count"
                      value={form.count || "-"}
                    />
                    <WizardReviewRow
                      label="Boot source"
                      value={
                        form.bootSource === "image"
                          ? "Local image disk"
                          : form.bootSource === "image-volume"
                            ? "New image-backed boot volume"
                            : "Existing boot volume"
                      }
                    />
                    {form.bootSource === "volume" ? (
                      <WizardReviewRow
                        label="Volume"
                        value={
                          selectedVolume
                            ? `${selectedVolume.name || selectedVolume.id} · ${selectedVolume.size} GiB`
                            : form.volumeRef || "-"
                        }
                      />
                    ) : (
                      <WizardReviewRow
                        label="Image"
                        value={selectedImage?.name || form.imageRef || "-"}
                      />
                    )}
                    {form.bootSource === "image-volume" ? (
                      <>
                        <WizardReviewRow
                          label="Boot volume"
                          value={`${form.bootVolumeSize || "-"} GiB · ${selectedVolumeType?.name || "Project default type"}`}
                        />
                        <WizardReviewRow
                          label="Delete with instance"
                          value={
                            form.deleteOnTermination ? "Enabled" : "Disabled"
                          }
                        />
                      </>
                    ) : form.bootSource === "volume" ? (
                      <WizardReviewRow
                        label="Delete with instance"
                        value={
                          form.deleteOnTermination ? "Enabled" : "Disabled"
                        }
                      />
                    ) : null}
                    <WizardReviewRow
                      label="Flavor"
                      value={
                        selectedFlavor
                          ? formatFlavorCapacity(selectedFlavor)
                          : form.flavorRef || "-"
                      }
                    />
                    <WizardReviewRow
                      label="Availability zone"
                      value={form.availabilityZone || "Scheduler default"}
                    />
                    <WizardReviewRow
                      label="Networks"
                      value={selectedNetworkNames.join(", ") || "None"}
                    />
                    <WizardReviewRow
                      label="Security groups"
                      value={form.securityGroupNames.join(", ") || "None"}
                    />
                    <WizardReviewRow
                      label="Key pair"
                      value={
                        form.keyName === "none" ? "No key pair" : form.keyName
                      }
                    />
                    <WizardReviewRow
                      label="Metadata"
                      value={
                        configuredMetadata.length
                          ? `${configuredMetadata.length} entr${configuredMetadata.length === 1 ? "y" : "ies"}`
                          : "None"
                      }
                    />
                    <WizardReviewRow
                      label="User data"
                      value={form.userData ? "Configured" : "Not configured"}
                    />
                    <WizardReviewRow
                      label="Config drive"
                      value={form.configDrive ? "Enabled" : "Disabled"}
                    />
                  </dl>
                  <QuotaImpactPreview
                    impacts={quotaImpacts}
                    loading={quota.isLoading}
                    unavailableMessage={quotaUnavailableMessage}
                    title="Compute quota impact"
                  />
                  {form.bootSource === "image-volume" ? (
                    <QuotaImpactPreview
                      impacts={storageQuotaImpacts}
                      loading={storageQuota.isLoading}
                      unavailableMessage={storageQuotaUnavailableMessage}
                      title="Block Storage quota impact"
                      description="Nova creates one boot volume per instance. The request must fit aggregate, per-volume, and selected volume-type limits."
                    />
                  ) : null}
                </TabsContent>
              </div>
            </Tabs>

            {errorMessage ? (
              <div className="px-4 pb-4">
                <MutationAlert>{errorMessage}</MutationAlert>
              </div>
            ) : null}

            <WizardDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              {activeTab === "review" ? (
                <Button
                  type="submit"
                  disabled={reviewIssues.length > 0 || isPending}
                >
                  {isPending ? "Creating" : "Create instance"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => setActiveTab("review")}
                >
                  Review instance
                </Button>
              )}
            </WizardDialogFooter>
          </form>
        </WizardDialogContent>
      </WizardDialog>
    </>
  );
}
