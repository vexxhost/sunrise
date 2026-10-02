"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Plus } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  volumeAvailabilityZonesQueryOptions,
  volumeTypesQueryOptions,
} from "@/hooks/queries/useVolumes";
import {
  projectQuotaQueryOptions,
  quotaQueryUnavailableMessage,
} from "@/hooks/queries/useQuotas";
import { createVolumeAction } from "@/lib/openstack/cinder-actions";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import {
  cinderVolumeQuotaImpacts,
  quotaImpactIssues,
  quotaUnavailableReason,
} from "@/lib/openstack/quota-impact";

interface VolumeActionsProps {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}

const INITIAL_FORM = {
  name: "",
  description: "",
  size: "1",
  volumeType: "default",
  availabilityZone: "default",
};

export function VolumeActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: VolumeActionsProps) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const types = useQuery({
    ...volumeTypesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const zones = useQuery({
    ...volumeAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const quota = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, "storage"),
    enabled: open && Boolean(regionId && projectId),
  });
  const size = Number(form.size);
  const selectedType = (types.data ?? []).find(
    ({ id }) => id === form.volumeType,
  );
  const quotaMetrics =
    quota.data?.status === "available" ? quota.data.metrics : [];
  const quotaImpacts = cinderVolumeQuotaImpacts(
    quotaMetrics,
    size,
    selectedType?.name,
  );
  const quotaIssues = quotaImpactIssues(quotaImpacts);
  const quotaUnavailableMessage = quotaQueryUnavailableMessage(
    quota,
    "Block Storage quotas are unavailable. Cinder will validate the request when it is submitted.",
  );
  const typeQuotaReasons = new Map(
    (types.data ?? []).map((type) => {
      const reason = quotaUnavailableReason(
        cinderVolumeQuotaImpacts(quotaMetrics, size, type.name),
      );
      return [type.id, reason ? `Insufficient ${reason} quota` : null];
    }),
  );

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) clearCreateActionIntent();
    setError(null);
    if (nextOpen) setForm(INITIAL_FORM);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId) return;

    startTransition(async () => {
      setError(null);
      const result = await createVolumeAction(
        { projectId, regionId },
        {
          name: form.name,
          description: form.description || undefined,
          size: form.size,
          volumeType:
            form.volumeType === "default" ? undefined : form.volumeType,
          availabilityZone:
            form.availabilityZone === "default"
              ? undefined
              : form.availabilityZone,
        },
      );

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setDialogOpen(false);
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "volumes"],
      });
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "project-quotas", "storage"],
      });
    });
  };

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="size-4" />
        Create volume
      </Button>

      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HardDrive className="size-5" />
                Create volume
              </DialogTitle>
              <DialogDescription>
                Provision project block storage. Cinder selects the default type
                and availability zone unless you override them.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="volume-name">Name</Label>
                <Input
                  id="volume-name"
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
                <Label htmlFor="volume-size">Capacity (GiB)</Label>
                <Input
                  id="volume-size"
                  type="number"
                  min={1}
                  step={1}
                  value={form.size}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      size: event.target.value,
                    }))
                  }
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="volume-type">Type</Label>
                <Select
                  value={form.volumeType}
                  onValueChange={(volumeType) =>
                    setForm((current) => ({ ...current, volumeType }))
                  }
                  disabled={isPending || types.isLoading}
                >
                  <SelectTrigger id="volume-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Project default</SelectItem>
                    {(types.data ?? []).map((type) => {
                      const reason = typeQuotaReasons.get(type.id);
                      return (
                        <SelectItem
                          key={type.id}
                          value={type.id}
                          textValue={type.name}
                          disabled={Boolean(reason)}
                          className="py-2"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{type.name}</span>
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
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="volume-zone">Availability zone</Label>
                <Select
                  value={form.availabilityZone}
                  onValueChange={(availabilityZone) =>
                    setForm((current) => ({ ...current, availabilityZone }))
                  }
                  disabled={isPending || zones.isLoading}
                >
                  <SelectTrigger id="volume-zone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Scheduler default</SelectItem>
                    {(zones.data ?? []).map((zone) => (
                      <SelectItem key={zone.zoneName} value={zone.zoneName}>
                        {zone.zoneName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="volume-description">Description</Label>
                <Textarea
                  id="volume-description"
                  maxLength={255}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={isPending}
                />
              </div>
            </div>

            <QuotaImpactPreview
              impacts={quotaImpacts}
              loading={quota.isLoading}
              unavailableMessage={quotaUnavailableMessage}
              description="The request must fit aggregate Block Storage quotas and any limits configured for the selected volume type."
            />

            {error ? <MutationAlert>{error}</MutationAlert> : null}

            {quotaIssues.length ? (
              <MutationAlert>{quotaIssues.join(" ")}</MutationAlert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.name.trim() ||
                  !Number.isInteger(size) ||
                  size < 1 ||
                  quotaIssues.length > 0 ||
                  isPending
                }
              >
                {isPending ? "Creating" : "Create volume"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
