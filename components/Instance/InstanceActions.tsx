"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Server, Trash2 } from "lucide-react";

import { ImagePicker } from "@/components/Image/ImageSelectOption";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatFlavorCapacity } from "@/lib/openstack/flavor";
import { createServerAction } from "@/lib/openstack/nova-actions";
import { normalizeMutationProjectId } from "@/lib/mutations";
import type {
  Flavor,
  Image,
  Keypair,
  Network,
  SecurityGroup,
  ComputeAvailabilityZone,
} from "@/types/openstack";

interface InstanceActionsProps {
  projectId?: string;
  regionId?: string;
}

type MetadataEntry = { id: number; key: string; value: string };

interface LaunchFormState {
  name: string;
  description: string;
  count: string;
  imageRef: string;
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
  imageRef: "",
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

export function InstanceActions({ projectId, regionId }: InstanceActionsProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
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
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const visibleNetworks = useMemo(
    () => projectNetworks(networks, projectId),
    [networks, projectId],
  );
  const visibleSecurityGroups = useMemo(
    () => projectSecurityGroups(securityGroups, projectId),
    [projectId, securityGroups],
  );
  const isSubmitDisabled = useMemo(() => {
    const count = Number(form.count);
    return (
      !form.name.trim() ||
      !form.flavorRef ||
      !form.imageRef ||
      !Number.isInteger(count) ||
      count < 1
    );
  }, [form.count, form.flavorRef, form.imageRef, form.name]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setErrorMessage(null);
        setIsOpen(false);
        return;
      }

      setIsOpen(open);
      setForm(INITIAL_FORM);
      setNextMetadataId(1);
      setErrorMessage(null);
      setOptionsLoading(true);

      void Promise.all([
        queryClient.fetchQuery(imagesQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(flavorsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(networksQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(securityGroupsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(keypairsQueryOptions(regionId, projectId)),
        queryClient.fetchQuery(
          serverAvailabilityZonesQueryOptions(regionId, projectId),
        ),
      ])
        .then(
          ([
            nextImages,
            nextFlavors,
            nextNetworks,
            nextSecurityGroups,
            nextKeypairs,
            nextAvailabilityZones,
          ]) => {
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
          },
        )
        .catch(() => {
          setErrorMessage(
            "Unable to load launch options. Refresh and try again.",
          );
        })
        .finally(() => setOptionsLoading(false));
    },
    [projectId, queryClient, regionId],
  );

  const toggleString = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

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
    if (!projectId || !regionId) return;

    startTransition(async () => {
      setErrorMessage(null);
      const result = await createServerAction(
        { projectId, regionId },
        {
          name: form.name,
          description: form.description || undefined,
          count: Number(form.count),
          imageRef: form.imageRef,
          flavorRef: form.flavorRef,
          keyName: form.keyName === "none" ? undefined : form.keyName,
          networkIds: form.networkIds,
          securityGroupNames: form.securityGroupNames,
          availabilityZone: form.availabilityZone || undefined,
          metadata: metadataRecord(form.metadata),
          userData: form.userData || undefined,
          configDrive: form.configDrive,
        },
      );

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setIsOpen(false);
      setForm(INITIAL_FORM);
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "servers"],
      });
    });
  };

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

      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-4xl">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <SheetHeader className="border-b pr-12">
              <SheetTitle className="flex items-center gap-2">
                <Server className="size-5" />
                Launch instance
              </SheetTitle>
              <SheetDescription>
                Configure identity, source, capacity, and project connectivity.
              </SheetDescription>
            </SheetHeader>

            <Tabs
              className="flex min-h-0 flex-1 flex-col px-4 pt-4"
              defaultValue="details"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
                <TabsTrigger value="networking">
                  Network &amp; security
                </TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
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
                          disabled={isPending}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Nova creates this many instances with identical
                          settings, subject to project quota.
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
                        Image and capacity
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Select the operating system image and compute shape for
                        every instance in this launch.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="launch-image">Image</Label>
                      <ImagePicker
                        disabled={optionsLoading || isPending}
                        id="launch-image"
                        images={images}
                        onValueChange={(imageRef) =>
                          setForm((current) => ({ ...current, imageRef }))
                        }
                        placeholder={
                          optionsLoading ? "Loading images" : "Choose an image"
                        }
                        value={form.imageRef}
                      />
                    </div>
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
                    </div>
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
              </div>
            </Tabs>

            {errorMessage ? (
              <div className="px-4 pb-4">
                <MutationAlert>{errorMessage}</MutationAlert>
              </div>
            ) : null}

            <SheetFooter className="border-t bg-background sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitDisabled || isPending}>
                {isPending ? "Launching" : "Launch instance"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
