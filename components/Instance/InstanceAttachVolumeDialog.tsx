"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import { Spinner } from "@/components/ui/spinner";
import { volumesQueryOptions } from "@/hooks/queries/useVolumes";
import { attachVolumeAction } from "@/lib/openstack/cinder-actions";
import { canAttachVolume } from "@/lib/openstack/storage-lifecycle";
import type { Server } from "@/types/openstack";

interface InstanceAttachVolumeDialogProps {
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
  server: Server;
}

export function InstanceAttachVolumeDialog({
  onComplete,
  onOpenChange,
  open,
  projectId,
  regionId,
  server,
}: InstanceAttachVolumeDialogProps) {
  const queryClient = useQueryClient();
  const [volumeId, setVolumeId] = useState("");
  const [tag, setTag] = useState("");
  const [deleteOnTermination, setDeleteOnTermination] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const volumes = useQuery({
    ...volumesQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const choices = useMemo(
    () =>
      (volumes.data ?? []).filter(
        (volume) =>
          canAttachVolume(volume) &&
          !volume.attachments.some(
            (attachment) => attachment.server_id === server.id,
          ),
      ),
    [server.id, volumes.data],
  );

  const close = () => {
    if (pending) return;
    setVolumeId("");
    setTag("");
    setDeleteOnTermination(false);
    setError(null);
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !volumeId) return;

    startTransition(async () => {
      setError(null);
      const result = await attachVolumeAction(
        { projectId, regionId },
        {
          volumeId,
          serverId: server.id,
          deleteOnTermination,
          tag: tag || undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volume", volumeId],
        }),
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "volumes"],
        }),
      ]);
      await onComplete();
      queryClient.setQueryData<Server>(
        [regionId, projectId, "server", server.id],
        (current) => {
          if (!current) return current;
          const attached =
            current["os-extended-volumes:volumes_attached"] ?? [];
          return attached.some(({ id }) => id === volumeId)
            ? current
            : {
                ...current,
                "os-extended-volumes:volumes_attached": [
                  ...attached,
                  { id: volumeId },
                ],
              };
        },
      );
      setVolumeId("");
      setTag("");
      setDeleteOnTermination(false);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Attach volume</DialogTitle>
            <DialogDescription>
              Connect an available Cinder volume to {server.name || server.id}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="instance-volume">Volume</Label>
            <Select
              value={volumeId}
              onValueChange={setVolumeId}
              disabled={pending || volumes.isLoading}
            >
              <SelectTrigger id="instance-volume">
                <SelectValue
                  placeholder={
                    volumes.isLoading ? "Loading volumes" : "Choose a volume"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {choices.map((volume) => (
                  <SelectItem key={volume.id} value={volume.id}>
                    {volume.name || volume.id} · {volume.size} GiB ·{" "}
                    {volume.volume_type || "default type"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!volumes.isLoading && choices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No attachable volumes are available in this project.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instance-volume-tag">Device tag</Label>
            <Input
              id="instance-volume-tag"
              maxLength={60}
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="Optional"
              disabled={pending}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={deleteOnTermination}
              onCheckedChange={(value) =>
                setDeleteOnTermination(value === true)
              }
              disabled={pending}
            />
            <span>
              <span className="block text-sm font-medium">
                Delete with instance
              </span>
              <span className="block text-xs text-muted-foreground">
                Permanently delete this volume when the instance is deleted.
              </span>
            </span>
          </label>

          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !volumeId}>
              {pending ? <Spinner /> : null}
              {pending ? "Attaching" : "Attach volume"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
