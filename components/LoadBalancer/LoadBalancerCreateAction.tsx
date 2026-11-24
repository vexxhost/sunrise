"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Waypoints } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
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
import {
  networksQueryOptions,
  visibleSubnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import { loadBalancerAvailabilityZonesQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { createLoadBalancerAction } from "@/lib/openstack/octavia-actions";
import {
  OCTAVIA_MAX_RESOURCE_TAG_LENGTH,
  OCTAVIA_MAX_RESOURCE_TAGS,
} from "@/lib/openstack/octavia-tags";

type TagDraft = { id: string; value: string };

function tagDraft(): TagDraft {
  return { id: crypto.randomUUID(), value: "" };
}

export function LoadBalancerCreateAction({
  availabilityZoneSupport,
  initiallyOpen = false,
  projectId,
  regionId,
  tagSupport,
}: {
  availabilityZoneSupport: OpenStackFeatureSupport;
  initiallyOpen?: boolean;
  projectId: string;
  regionId: string;
  tagSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vipSubnetId, setVipSubnetId] = useState("");
  const [availabilityZone, setAvailabilityZone] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [tags, setTags] = useState<TagDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagsAvailable = tagSupport.status !== "unsupported";
  const availabilityZonesAvailable =
    availabilityZoneSupport.status !== "unsupported";
  const networks = useQuery({
    ...networksQueryOptions(regionId, projectId),
    enabled: open,
  });
  const subnets = useQuery({
    ...visibleSubnetsQueryOptions(regionId, projectId),
    enabled: open,
  });
  const zones = useQuery({
    ...loadBalancerAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && availabilityZonesAvailable,
  });
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "loadbalancer", requested: 1 }],
    serviceId: "load-balancing",
  });
  const networkNames = useMemo(
    () =>
      new Map(
        (networks.data ?? []).map((network) => [network.id, network.name]),
      ),
    [networks.data],
  );
  const subnetOptions = useMemo(
    () =>
      [...(subnets.data ?? [])].sort((left, right) => {
        const leftNetwork =
          networkNames.get(left.network_id) || left.network_id;
        const rightNetwork =
          networkNames.get(right.network_id) || right.network_id;
        return `${leftNetwork}/${left.name || left.cidr}`.localeCompare(
          `${rightNetwork}/${right.name || right.cidr}`,
        );
      }),
    [networkNames, subnets.data],
  );
  const zoneOptions = useMemo(
    () =>
      (zones.data?.availabilityZones ?? [])
        .filter((zone) => zone.enabled)
        .map((zone) => zone.name)
        .sort((left, right) => left.localeCompare(right)),
    [zones.data],
  );
  const submittedTags = tags
    .map((tag) => tag.value)
    .filter((tag) => tag.length > 0);
  const resourceQueriesFailed = networks.isError || subnets.isError;

  const reset = () => {
    setName("");
    setDescription("");
    setVipSubnetId("");
    setAvailabilityZone("");
    setAdminStateUp(true);
    setTags([]);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) {
      reset();
      clearCreateActionIntent();
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !vipSubnetId || resourceQueriesFailed) return;

    startTransition(async () => {
      setError(null);
      const result = await createLoadBalancerAction(
        { projectId, regionId },
        {
          name,
          description: description || undefined,
          vipSubnetId,
          availabilityZone:
            availabilityZonesAvailable && availabilityZone
              ? availabilityZone
              : undefined,
          adminStateUp,
          tags: tagsAvailable ? submittedTags : [],
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "octavia"],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "project-quotas", "load-balancing"],
        }),
      ]);
      handleOpenChange(false);
    });
  };

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create load balancer
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Waypoints className="size-5" />
                Create load balancer
              </DialogTitle>
              <DialogDescription>
                Provision an Octavia virtual IP on a project-visible subnet.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="load-balancer-name">Name</Label>
                <Input
                  id="load-balancer-name"
                  autoFocus
                  disabled={pending}
                  maxLength={255}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="load-balancer-description">Description</Label>
                <Textarea
                  id="load-balancer-description"
                  disabled={pending}
                  maxLength={255}
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="load-balancer-subnet">VIP subnet</Label>
                <Select
                  disabled={pending || subnets.isLoading || networks.isLoading}
                  onValueChange={setVipSubnetId}
                  value={vipSubnetId}
                >
                  <SelectTrigger id="load-balancer-subnet" className="w-full">
                    <SelectValue
                      placeholder={
                        subnets.isLoading || networks.isLoading
                          ? "Loading subnets"
                          : "Select a subnet"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subnetOptions.map((subnet) => {
                      const networkName =
                        networkNames.get(subnet.network_id) ||
                        subnet.network_id;
                      return (
                        <SelectItem key={subnet.id} value={subnet.id}>
                          {networkName} / {subnet.name || "Unnamed subnet"} (
                          {subnet.cidr})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Octavia allocates the virtual IP from this subnet.
                </p>
              </div>
              {availabilityZonesAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="load-balancer-availability-zone">
                    Availability zone
                  </Label>
                  <Select
                    disabled={pending || zones.isLoading}
                    onValueChange={(value) =>
                      setAvailabilityZone(
                        value === "cloud-default" ? "" : value,
                      )
                    }
                    value={availabilityZone || "cloud-default"}
                  >
                    <SelectTrigger
                      id="load-balancer-availability-zone"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloud-default">
                        Cloud scheduler
                      </SelectItem>
                      {zoneOptions.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div
                className={
                  availabilityZonesAvailable
                    ? "flex items-start gap-3 rounded-md border p-3"
                    : "flex items-start gap-3 rounded-md border p-3 sm:col-span-2"
                }
              >
                <Checkbox
                  id="load-balancer-admin-state"
                  checked={adminStateUp}
                  disabled={pending}
                  onCheckedChange={(value) => setAdminStateUp(value === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="load-balancer-admin-state">
                    Admin state up
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable the load balancer after provisioning.
                  </p>
                </div>
              </div>
            </div>

            {tagsAvailable ? (
              <section className="space-y-3 border-t pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Tags</h3>
                    <p className="text-xs text-muted-foreground">
                      Optional exact values. Each tag may contain up to{" "}
                      {OCTAVIA_MAX_RESOURCE_TAG_LENGTH} characters, excluding
                      commas and slashes.
                    </p>
                  </div>
                  <Button
                    aria-label="Add tag"
                    disabled={
                      pending || tags.length >= OCTAVIA_MAX_RESOURCE_TAGS
                    }
                    onClick={() =>
                      setTags((current) => [...current, tagDraft()])
                    }
                    size="icon-sm"
                    title="Add tag"
                    type="button"
                    variant="outline"
                  >
                    <Plus />
                  </Button>
                </div>
                {tags.length ? (
                  <div className="space-y-2">
                    {tags.map((tag, index) => (
                      <div className="flex items-center gap-2" key={tag.id}>
                        <Label
                          className="sr-only"
                          htmlFor={`load-balancer-tag-${tag.id}`}
                        >
                          Tag {index + 1}
                        </Label>
                        <Input
                          id={`load-balancer-tag-${tag.id}`}
                          disabled={pending}
                          maxLength={OCTAVIA_MAX_RESOURCE_TAG_LENGTH}
                          onChange={(event) =>
                            setTags((current) =>
                              current.map((currentTag) =>
                                currentTag.id === tag.id
                                  ? { ...currentTag, value: event.target.value }
                                  : currentTag,
                              ),
                            )
                          }
                          placeholder="env:test"
                          value={tag.value}
                        />
                        <Button
                          aria-label={`Remove tag ${index + 1}`}
                          disabled={pending}
                          onClick={() =>
                            setTags((current) =>
                              current.filter(
                                (currentTag) => currentTag.id !== tag.id,
                              ),
                            )
                          }
                          size="icon-sm"
                          title="Remove tag"
                          tone="danger"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No tags will be applied.
                  </p>
                )}
              </section>
            ) : (
              <MutationAlert variant="info" title="Tags unavailable">
                {tagSupport.message}
              </MutationAlert>
            )}

            {!availabilityZonesAvailable ? (
              <MutationAlert
                variant="info"
                title="Availability-zone placement unavailable"
              >
                {availabilityZoneSupport.message}
              </MutationAlert>
            ) : null}
            {zones.isError ? (
              <MutationAlert
                variant="info"
                title="Availability zones unavailable"
              >
                The cloud scheduler can still choose placement.
              </MutationAlert>
            ) : null}
            {resourceQueriesFailed ? (
              <MutationAlert>
                Network choices could not be loaded. Refresh and try again.
              </MutationAlert>
            ) : null}
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}

            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !name.trim() ||
                  !vipSubnetId ||
                  resourceQueriesFailed ||
                  quota.issues.length > 0
                }
                loading={pending}
                type="submit"
              >
                <Plus />
                Create load balancer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
