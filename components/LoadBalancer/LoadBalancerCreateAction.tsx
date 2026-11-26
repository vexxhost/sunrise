"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Waypoints } from "lucide-react";

import {
  OctaviaTagsEditor,
  octaviaTagsFromDrafts,
  type OctaviaTagDraft,
} from "@/components/LoadBalancer/OctaviaTags";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { AvailabilityZoneSelect } from "@/components/OpenStack/AvailabilityZoneSelect";
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
import { validateOctaviaTags } from "@/lib/openstack/octavia-tags";
import { fixedVipAddressError } from "@/lib/openstack/octavia-vip-address";

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
  const [vipAddress, setVipAddress] = useState("");
  const [availabilityZone, setAvailabilityZone] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [tags, setTags] = useState<OctaviaTagDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagsAvailable = tagSupport.status !== "unsupported";
  const availabilityZoneLookupEnabled =
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
    enabled: open && availabilityZoneLookupEnabled,
  });
  const effectiveAvailabilityZoneSupport =
    zones.data?.support ?? availabilityZoneSupport;
  const availabilityZonesAvailable =
    effectiveAvailabilityZoneSupport.status !== "unsupported";
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
  const submittedTags = octaviaTagsFromDrafts(tags);
  const subnetQueryFailed = subnets.isError;
  const selectedSubnet = subnetOptions.find(
    (subnet) => subnet.id === vipSubnetId,
  );
  const vipError = fixedVipAddressError(vipAddress, selectedSubnet);
  const canSubmit =
    Boolean(name.trim() && selectedSubnet) &&
    !vipError &&
    !subnetQueryFailed &&
    quota.issues.length === 0;
  const noVisibleSubnets = subnets.isSuccess && subnetOptions.length === 0;
  const zoneLookupMessage = zones.isError
    ? "The cloud scheduler can still choose placement."
    : zones.data?.support.status === "unknown"
      ? zones.data.support.message
      : null;

  const reset = () => {
    setName("");
    setDescription("");
    setVipSubnetId("");
    setVipAddress("");
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
    if (pending || !canSubmit) return;

    const parsedTags = validateOctaviaTags(tagsAvailable ? submittedTags : []);
    if (!parsedTags.ok) {
      setError(parsedTags.error);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createLoadBalancerAction(
        { projectId, regionId },
        {
          name,
          description: description || undefined,
          vipSubnetId,
          vipAddress: vipAddress.trim() || undefined,
          availabilityZone:
            availabilityZonesAvailable && availabilityZone
              ? availabilityZone
              : undefined,
          adminStateUp,
          tags: parsedTags.tags,
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
                  disabled={pending || subnets.isLoading || noVisibleSubnets}
                  onValueChange={setVipSubnetId}
                  value={selectedSubnet?.id ?? ""}
                >
                  <SelectTrigger id="load-balancer-subnet" className="w-full">
                    <SelectValue
                      placeholder={
                        subnets.isLoading
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
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="load-balancer-vip-address">
                  VIP address (optional)
                </Label>
                <Input
                  id="load-balancer-vip-address"
                  aria-describedby="load-balancer-vip-address-help"
                  aria-invalid={Boolean(vipError)}
                  autoComplete="off"
                  disabled={
                    pending || (!vipAddress && selectedSubnet?.ip_version !== 4)
                  }
                  onChange={(event) => setVipAddress(event.target.value)}
                  value={vipAddress}
                />
                <p
                  id="load-balancer-vip-address-help"
                  className={
                    vipError
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {vipError ??
                    (selectedSubnet?.ip_version === 6
                      ? "Octavia will allocate the IPv6 address automatically."
                      : "Leave blank for automatic allocation.")}
                </p>
              </div>
              {availabilityZonesAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="load-balancer-availability-zone">
                    Availability zone
                  </Label>
                  <AvailabilityZoneSelect
                    defaultLabel="Cloud scheduler"
                    disabled={pending || zones.isLoading}
                    id="load-balancer-availability-zone"
                    onValueChange={setAvailabilityZone}
                    value={availabilityZone}
                    zones={zoneOptions}
                  />
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
              <OctaviaTagsEditor
                disabled={pending}
                idPrefix="load-balancer-tag"
                onChange={setTags}
                tags={tags}
              />
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
                {effectiveAvailabilityZoneSupport.message}
              </MutationAlert>
            ) : null}
            {zoneLookupMessage ? (
              <MutationAlert
                variant="info"
                title="Availability zones unavailable"
              >
                {zoneLookupMessage}
              </MutationAlert>
            ) : null}
            {networks.isError && subnetOptions.length > 0 ? (
              <MutationAlert variant="info" title="Network names unavailable">
                Subnets can still be selected by network ID.
              </MutationAlert>
            ) : null}
            {subnetQueryFailed ? (
              <MutationAlert>
                Subnet choices could not be loaded. Refresh and try again.
              </MutationAlert>
            ) : null}
            {noVisibleSubnets ? (
              <MutationAlert variant="info" title="No subnets available">
                Create or share a subnet with this project before provisioning a
                load balancer.
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
              <Button disabled={!canSubmit} loading={pending} type="submit">
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
