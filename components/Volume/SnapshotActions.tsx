"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus } from "lucide-react";

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
import { volumesQueryOptions } from "@/hooks/queries/useVolumes";
import {
  projectQuotaQueryOptions,
  quotaQueryUnavailableMessage,
} from "@/hooks/queries/useQuotas";
import { createSnapshotAction } from "@/lib/openstack/cinder-actions";
import {
  cinderSnapshotQuotaImpacts,
  quotaImpactIssues,
} from "@/lib/openstack/quota-impact";
import { canSnapshotVolume } from "@/lib/openstack/storage-lifecycle";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";

interface SnapshotActionsProps {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}

export function SnapshotActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: SnapshotActionsProps) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [volumeId, setVolumeId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const volumes = useQuery({
    ...volumesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId),
  });
  const eligibleVolumes = (volumes.data ?? []).filter(canSnapshotVolume);
  const selectedVolume = eligibleVolumes.find(
    (volume) => volume.id === volumeId,
  );
  const quota = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, "storage"),
    enabled: open && Boolean(regionId && projectId),
  });
  const quotaMetrics =
    quota.data?.status === "available" ? quota.data.metrics : [];
  const quotaImpacts = cinderSnapshotQuotaImpacts(
    quotaMetrics,
    selectedVolume?.volume_type,
  );
  const quotaIssues = quotaImpactIssues(quotaImpacts);
  const quotaUnavailableMessage = quotaQueryUnavailableMessage(
    quota,
    "Block Storage quotas are unavailable. Cinder will validate the request when it is submitted.",
  );

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) clearCreateActionIntent();
    setError(null);
    if (nextOpen) {
      setVolumeId("");
      setName("");
      setDescription("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId) return;

    startTransition(async () => {
      const result = await createSnapshotAction(
        { projectId, regionId },
        { volumeId, name, description: description || undefined },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      void queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "snapshots"],
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
        Create snapshot
      </Button>

      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="size-5" />
                Create snapshot
              </DialogTitle>
              <DialogDescription>
                Capture a point-in-time copy of an available or attached volume.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="snapshot-volume">Volume</Label>
              <Select
                value={volumeId}
                onValueChange={setVolumeId}
                disabled={isPending}
              >
                <SelectTrigger id="snapshot-volume">
                  <SelectValue
                    placeholder={
                      volumes.isLoading ? "Loading volumes" : "Choose a volume"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {eligibleVolumes.map((volume) => (
                    <SelectItem key={volume.id} value={volume.id}>
                      {volume.name || volume.id} · {volume.size} GiB ·{" "}
                      {volume.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snapshot-name">Name</Label>
              <Input
                id="snapshot-name"
                maxLength={255}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snapshot-description">Description</Label>
              <Textarea
                id="snapshot-description"
                maxLength={255}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isPending}
              />
            </div>
            <QuotaImpactPreview
              impacts={quotaImpacts}
              loading={quota.isLoading}
              unavailableMessage={quotaUnavailableMessage}
              description="Snapshot count quotas are projected. Cinder validates storage quota because operators can configure snapshots not to consume gigabyte quota."
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
                  !volumeId ||
                  !name.trim() ||
                  quotaIssues.length > 0 ||
                  isPending
                }
              >
                {isPending ? "Creating" : "Create snapshot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
