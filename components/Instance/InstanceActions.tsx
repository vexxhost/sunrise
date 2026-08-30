"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Server, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import {
  networksQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  flavorsQueryOptions,
  keypairsQueryOptions,
} from "@/hooks/queries/useServers";
import { createServerAction } from "@/lib/openstack/nova-actions";
import { normalizeMutationProjectId } from "@/lib/mutations";
import type { Flavor, Image, Keypair, Network, SecurityGroup } from "@/types/openstack";

interface InstanceActionsProps {
  projectId?: string;
  regionId?: string;
}

type MetadataEntry = { id: number; key: string; value: string };

interface LaunchFormState {
  name: string;
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
        normalizeMutationProjectId(network.project_id) === activeProject || network.shared,
    )
    .sort((left, right) => {
      const leftOwned = normalizeMutationProjectId(left.project_id) === activeProject;
      const rightOwned = normalizeMutationProjectId(right.project_id) === activeProject;
      return Number(rightOwned) - Number(leftOwned) || left.name.localeCompare(right.name);
    });
}

function projectSecurityGroups(securityGroups: SecurityGroup[], projectId?: string) {
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

  const isSubmitDisabled = useMemo(
    () => !form.name.trim() || !form.flavorRef || !form.imageRef,
    [form.flavorRef, form.imageRef, form.name],
  );

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
      ])
        .then(
          ([nextImages, nextFlavors, nextNetworks, nextSecurityGroups, nextKeypairs]) => {
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
          setErrorMessage("Unable to load launch options. Refresh and try again.");
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
      metadata: [...current.metadata, { id: nextMetadataId, key: "", value: "" }],
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

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="size-5" />
                Launch instance
              </DialogTitle>
              <DialogDescription>
                Choose the image, capacity, and project networking for the new
                virtual machine.
              </DialogDescription>
            </DialogHeader>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Instance</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="launch-name">Name</Label>
                  <Input
                    id="launch-name"
                    autoFocus
                    maxLength={255}
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    disabled={isPending}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="launch-image">Image</Label>
                  <Select
                    value={form.imageRef}
                    onValueChange={(imageRef) =>
                      setForm((current) => ({ ...current, imageRef }))
                    }
                    disabled={optionsLoading || isPending}
                    required
                  >
                    <SelectTrigger id="launch-image">
                      <SelectValue
                        placeholder={optionsLoading ? "Loading images" : "Choose an image"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {images.map((image) => (
                        <SelectItem key={image.id} value={image.id}>
                          {image.name || image.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <SelectTrigger id="launch-flavor">
                      <SelectValue
                        placeholder={optionsLoading ? "Loading flavors" : "Choose capacity"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {flavors.map((flavor) => (
                        <SelectItem key={flavor.id} value={String(flavor.id)}>
                          {flavor.name} · {flavor.vcpus} vCPU · {flavor.ram} MB
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <SelectTrigger id="launch-keypair">
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
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div>
                <h3 className="text-sm font-semibold">Networking</h3>
                <p className="text-xs text-muted-foreground">
                  Attach one or more project networks and apply security groups.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Networks</Label>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
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
                                networkIds: toggleString(current.networkIds, network.id),
                              }))
                            }
                            disabled={isPending}
                          />
                          <span className="truncate">{network.name || network.id}</span>
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
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
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
                            checked={form.securityGroupNames.includes(group.name)}
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

            <details className="border-t pt-5">
              <summary className="cursor-pointer text-sm font-semibold">
                Advanced options
              </summary>
              <div className="mt-4 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="launch-az">Availability zone</Label>
                  <Input
                    id="launch-az"
                    value={form.availabilityZone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        availabilityZone: event.target.value,
                      }))
                    }
                    disabled={isPending}
                    placeholder="Use the scheduler default"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Metadata</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMetadata}>
                      <Plus className="size-4" />
                      Add metadata
                    </Button>
                  </div>
                  {form.metadata.length ? (
                    <div className="space-y-2">
                      {form.metadata.map((entry) => (
                        <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <Input
                            aria-label="Metadata key"
                            placeholder="Key"
                            maxLength={255}
                            value={entry.key}
                            onChange={(event) =>
                              updateMetadata(entry.id, "key", event.target.value)
                            }
                          />
                          <Input
                            aria-label="Metadata value"
                            placeholder="Value"
                            maxLength={255}
                            value={entry.value}
                            onChange={(event) =>
                              updateMetadata(entry.id, "value", event.target.value)
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
                    <p className="text-sm text-muted-foreground">No metadata added.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="launch-userdata">User data</Label>
                  <Textarea
                    id="launch-userdata"
                    className="min-h-36 font-mono text-xs"
                    value={form.userData}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, userData: event.target.value }))
                    }
                    disabled={isPending}
                    placeholder="#cloud-config"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sunrise encodes this value for Nova after server-side validation.
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
              </div>
            </details>

            {errorMessage ? <MutationAlert>{errorMessage}</MutationAlert> : null}

            <DialogFooter>
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
