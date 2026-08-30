"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Plus } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
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
import { createVolumeAction } from "@/lib/openstack/cinder-actions";

interface VolumeActionsProps {
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

export function VolumeActions({ projectId, regionId }: VolumeActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
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
          volumeType: form.volumeType === "default" ? undefined : form.volumeType,
          availabilityZone:
            form.availabilityZone === "default" ? undefined : form.availabilityZone,
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
        <DialogContent className="max-w-2xl">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HardDrive className="size-5" />
                Create volume
              </DialogTitle>
              <DialogDescription>
                Provision project block storage. Cinder selects the default type and
                availability zone unless you override them.
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
                    setForm((current) => ({ ...current, name: event.target.value }))
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
                    setForm((current) => ({ ...current, size: event.target.value }))
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
                    {(types.data ?? []).map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
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

            {error ? <MutationAlert>{error}</MutationAlert> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name.trim() || isPending}>
                {isPending ? "Creating" : "Create volume"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
