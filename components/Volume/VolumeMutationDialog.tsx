"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
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
import { serversQueryOptions } from "@/hooks/queries/useServers";
import {
  attachVolumeAction,
  createSnapshotAction,
  deleteVolumeAction,
  detachVolumeAction,
  updateVolumeAction,
} from "@/lib/openstack/cinder-actions";
import type { Server, Volume } from "@/types/openstack";

export type VolumeMutationKind =
  | "attach"
  | "delete"
  | "detach"
  | "edit"
  | "snapshot";

interface VolumeMutationDialogProps {
  action: VolumeMutationKind | null;
  onComplete: () => Promise<void> | void;
  onDeleteSuccess?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  regionId?: string;
  volumes: Volume[];
}

const ATTACHABLE_SERVER_STATUSES = new Set([
  "ACTIVE",
  "PAUSED",
  "SHELVED",
  "SHELVED_OFFLOADED",
  "SHUTOFF",
  "SUSPENDED",
]);

function serverLabel(server: Server) {
  return `${server.name || server.id} · ${server.status}`;
}

export function VolumeMutationDialog({
  action,
  onComplete,
  onDeleteSuccess,
  onOpenChange,
  projectId,
  regionId,
  volumes,
}: VolumeMutationDialogProps) {
  const volume = volumes[0];
  const attachments = volume?.attachments ?? [];
  const servers = useQuery({
    ...serversQueryOptions(regionId, projectId),
    enabled: action === "attach" && Boolean(regionId),
  });
  const attachableServers = useMemo(
    () =>
      (servers.data ?? []).filter((server) =>
        ATTACHABLE_SERVER_STATUSES.has(server.status),
      ),
    [servers.data],
  );
  const [name, setName] = useState(
    action === "snapshot"
      ? `${volume?.name || "volume"}-snapshot`
      : volume?.name || "",
  );
  const [description, setDescription] = useState(
    action === "snapshot" ? "" : volume?.description || "",
  );
  const [serverId, setServerId] = useState("");
  const [attachmentServerId, setAttachmentServerId] = useState(
    attachments[0]?.server_id || "",
  );
  const [deleteOnTermination, setDeleteOnTermination] = useState(false);
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!action || !volume) return null;

  const close = () => {
    setError(null);
    onOpenChange(false);
  };

  const run = (callback: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    if (!projectId || !regionId) {
      setError("Select a project and region before changing volumes.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await callback();
      if (!result.ok) {
        setError(result.error?.message ?? "The operation could not be completed.");
        return;
      }
      close();
      void onComplete();
      if (action === "delete") void onDeleteSuccess?.();
    });
  };

  if (action === "delete") {
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Delete volumes?"
        description="This permanently removes the selected volumes. Volumes with attachments, snapshots, or group membership must be cleaned up first."
        confirmLabel="Delete volumes"
        pendingLabel="Deleting"
        pending={isPending}
        error={error}
        variant="destructive"
        onConfirm={() =>
          run(async () => {
            const results = await Promise.all(
              volumes.map((selected) =>
                deleteVolumeAction(
                  { projectId: projectId!, regionId: regionId! },
                  selected.id,
                ),
              ),
            );
            const failures = results.flatMap((result) =>
              result.ok ? [] : [result.error.message],
            );
            return failures.length
              ? { ok: false, error: { message: failures[0] } }
              : { ok: true };
          })
        }
      >
        <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
          {volumes.map((selected) => (
            <div key={selected.id} className="truncate py-1">
              {selected.name || selected.id}
            </div>
          ))}
        </div>
      </MutationConfirmationDialog>
    );
  }

  const title = {
    attach: "Attach volume",
    detach: "Detach volume",
    edit: "Edit volume",
    snapshot: "Create snapshot",
  }[action];
  const submitLabel = {
    attach: "Attach",
    detach: "Detach",
    edit: "Save changes",
    snapshot: "Create snapshot",
  }[action];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scope = { projectId: projectId!, regionId: regionId! };

    if (action === "edit") {
      run(() => updateVolumeAction(scope, volume.id, { name, description }));
    } else if (action === "snapshot") {
      run(() =>
        createSnapshotAction(scope, {
          volumeId: volume.id,
          name,
          description: description || undefined,
        }),
      );
    } else if (action === "attach") {
      run(() =>
        attachVolumeAction(scope, {
          volumeId: volume.id,
          serverId,
          deleteOnTermination,
          tag: tag || undefined,
        }),
      );
    } else {
      run(() =>
        detachVolumeAction(scope, {
          volumeId: volume.id,
          serverId: attachmentServerId,
        }),
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {action === "attach" && "Connect this block device to a project instance."}
              {action === "detach" && "Disconnect the selected attachment cleanly through Nova."}
              {action === "edit" && "Change the display name and description."}
              {action === "snapshot" && "Capture a point-in-time copy of this volume."}
            </DialogDescription>
          </DialogHeader>

          {(action === "edit" || action === "snapshot") && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="volume-mutation-name">
                  {action === "snapshot" ? "Snapshot name" : "Name"}
                </Label>
                <Input
                  id="volume-mutation-name"
                  autoFocus
                  maxLength={255}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="volume-mutation-description">Description</Label>
                <Textarea
                  id="volume-mutation-description"
                  maxLength={255}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          {action === "attach" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="volume-server">Instance</Label>
                <Select value={serverId} onValueChange={setServerId} disabled={isPending}>
                  <SelectTrigger id="volume-server">
                    <SelectValue
                      placeholder={servers.isLoading ? "Loading instances" : "Choose an instance"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {attachableServers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        {serverLabel(server)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="volume-tag">Device tag</Label>
                <Input
                  id="volume-tag"
                  maxLength={60}
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="Optional"
                  disabled={isPending}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={deleteOnTermination}
                  onCheckedChange={(value) => setDeleteOnTermination(Boolean(value))}
                  disabled={isPending}
                />
                Delete this volume when the instance is deleted
              </label>
            </>
          )}

          {action === "detach" && (
            <div className="space-y-1.5">
              <Label htmlFor="volume-attachment">Attachment</Label>
              <Select
                value={attachmentServerId}
                onValueChange={setAttachmentServerId}
                disabled={isPending}
              >
                <SelectTrigger id="volume-attachment">
                  <SelectValue placeholder="Choose an attachment" />
                </SelectTrigger>
                <SelectContent>
                  {attachments.map((attachment) => (
                    <SelectItem
                      key={attachment.attachment_id || attachment.server_id}
                      value={attachment.server_id}
                    >
                      {attachment.server_id} · {attachment.device || "device pending"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error ? <MutationAlert>{error}</MutationAlert> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action === "detach" ? "destructive" : "default"}
              disabled={
                isPending ||
                ((action === "edit" || action === "snapshot") && !name.trim()) ||
                (action === "attach" && !serverId) ||
                (action === "detach" && !attachmentServerId)
              }
            >
              {isPending ? `${submitLabel}…` : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
