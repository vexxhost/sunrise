"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  attachVolumeAction,
  createBackupAction,
  createSnapshotAction,
  deleteBackupAction,
  deleteSnapshotAction,
  deleteVolumeAction,
  detachVolumeAction,
  extendVolumeAction,
  restoreBackupAction,
  retypeVolumeAction,
} from "@/lib/openstack/cinder-actions";
import type { Backup, Snapshot, Volume } from "@/types/openstack";
import { AlertTriangle, HardDrive, Plug, Scissors, Trash2, Wand2, Layers } from "lucide-react";

type ActiveDialog =
  | "extend"
  | "delete"
  | "attach"
  | "detach"
  | "snapshot-create"
  | "snapshot-delete"
  | "backup-create"
  | "backup-delete"
  | "backup-restore"
  | "retype";

interface VolumeDetailActionsProps {
  volume: Volume;
  snapshots: Snapshot[];
  backups: Backup[];
  regionId?: string;
  projectId?: string;
}

export function VolumeDetailActions({
  volume,
  snapshots,
  backups,
  regionId,
  projectId,
}: VolumeDetailActionsProps) {
  const queryClient = useQueryClient();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [extendSize, setExtendSize] = useState(String(volume.size + 1));
  const [instanceId, setInstanceId] = useState("");
  const [mountpoint, setMountpoint] = useState("/dev/vdb");
  const [mode, setMode] = useState<"rw" | "ro">("rw");
  const [hostName, setHostName] = useState("");
  const [forceDetach, setForceDetach] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDescription, setSnapshotDescription] = useState("");
  const [snapshotForce, setSnapshotForce] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState("");
  const [backupName, setBackupName] = useState("");
  const [backupDescription, setBackupDescription] = useState("");
  const [backupIncremental, setBackupIncremental] = useState(false);
  const [backupForce, setBackupForce] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [restoreVolumeId, setRestoreVolumeId] = useState("");
  const [restoreName, setRestoreName] = useState("");
  const [newVolumeType, setNewVolumeType] = useState("");
  const [migrationPolicy, setMigrationPolicy] = useState<"never" | "on-demand">("never");
  const [detachAttachmentId, setDetachAttachmentId] = useState("");

  const attachments = volume.attachments || [];

  const invalidateVolumeQueries = async () => {
    const invalidate = async (key: unknown[]) =>
      queryClient.invalidateQueries({ queryKey: key, exact: false });

    await Promise.all([
      invalidate([regionId, projectId, "volumes"]),
      invalidate([regionId, projectId, "volume", volume.id]),
      invalidate([regionId, projectId, "volume-snapshots", volume.id]),
      invalidate([regionId, projectId, "volume-backups", volume.id]),
    ]);
  };

  const openDialog = (dialog: ActiveDialog) => {
    setError(null);
    setActiveDialog(dialog);
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setError(null);
  };

  const handleExtend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const size = Number(extendSize);

    if (Number.isNaN(size) || size <= volume.size) {
      setError(`New size must be greater than current size (${volume.size} GB).`);
      return;
    }

    startTransition(async () => {
      try {
        await extendVolumeAction(volume.id, { new_size: size }, regionId);
        await invalidateVolumeQueries();
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to extend volume.");
      }
    });
  };

  const handleDelete = (force: boolean) => {
    startTransition(async () => {
      try {
        await deleteVolumeAction(volume.id, { force }, regionId);
        await invalidateVolumeQueries();
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete volume.");
      }
    });
  };

  const handleAttach = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!instanceId.trim()) {
      setError("Instance ID is required.");
      return;
    }

    startTransition(async () => {
      try {
        await attachVolumeAction(
          volume.id,
          {
            instance_uuid: instanceId,
            mountpoint: mountpoint || undefined,
            mode,
            host_name: hostName || undefined,
          },
          regionId,
        );
        await invalidateVolumeQueries();
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to attach volume.");
      }
    });
  };

  const handleDetach = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!detachAttachmentId) {
      setError("Select an attachment to detach.");
      return;
    }

    startTransition(async () => {
      try {
        await detachVolumeAction(
          volume.id,
          { attachment_id: detachAttachmentId, force: forceDetach },
          regionId,
        );
        await invalidateVolumeQueries();
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to detach volume.");
      }
    });
  };

  const handleSnapshotCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      try {
        await createSnapshotAction(
          {
            volume_id: volume.id,
            name: snapshotName || undefined,
            description: snapshotDescription || undefined,
            force: snapshotForce,
          },
          regionId,
        );
        await invalidateVolumeQueries();
        setSnapshotName("");
        setSnapshotDescription("");
        setSnapshotForce(false);
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create snapshot.");
      }
    });
  };

  const handleSnapshotDelete = () => {
    if (!selectedSnapshot) {
      setError("Select a snapshot to delete.");
      return;
    }

    startTransition(async () => {
      try {
        await deleteSnapshotAction(selectedSnapshot, regionId);
        await invalidateVolumeQueries();
        setSelectedSnapshot("");
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete snapshot.");
      }
    });
  };

  const handleBackupCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      try {
        await createBackupAction(
          {
            volume_id: volume.id,
            name: backupName || undefined,
            description: backupDescription || undefined,
            incremental: backupIncremental,
            force: backupForce,
          },
          regionId,
        );
        await invalidateVolumeQueries();
        setBackupName("");
        setBackupDescription("");
        setBackupIncremental(false);
        setBackupForce(false);
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create backup.");
      }
    });
  };

  const handleBackupDelete = () => {
    if (!selectedBackup) {
      setError("Select a backup to delete.");
      return;
    }

    startTransition(async () => {
      try {
        await deleteBackupAction(selectedBackup, regionId);
        await invalidateVolumeQueries();
        setSelectedBackup("");
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete backup.");
      }
    });
  };

  const handleBackupRestore = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedBackup) {
      setError("Select a backup to restore.");
      return;
    }

    startTransition(async () => {
      try {
        await restoreBackupAction(
          selectedBackup,
          {
            volume_id: restoreVolumeId || undefined,
            name: restoreName || undefined,
          },
          regionId,
        );
        await invalidateVolumeQueries();
        setRestoreVolumeId("");
        setRestoreName("");
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restore backup.");
      }
    });
  };

  const handleRetype = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newVolumeType) {
      setError("New volume type is required.");
      return;
    }

    startTransition(async () => {
      try {
        await retypeVolumeAction(
          volume.id,
          {
            new_type: newVolumeType,
            migration_policy: migrationPolicy,
          },
          regionId,
        );
        await invalidateVolumeQueries();
        setNewVolumeType("");
        setMigrationPolicy("never");
        closeDialog();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to retype volume.");
      }
    });
  };

  const VolumeActionDialog: React.FC<{ children: React.ReactNode; dialog: ActiveDialog }> = ({
    children,
    dialog,
  }) => (
    <Dialog open={activeDialog === dialog} onOpenChange={(open) => (!open ? closeDialog() : null)}>
      <DialogContent>
        {children}
        {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );

  const attachmentOptions = useMemo(
    () =>
      attachments.map((attachment) => ({
        id: attachment.attachment_id || attachment.id,
        label: `${attachment.server_id} (${attachment.device})`,
      })),
    [attachments],
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            Manage Volume
            <Layers className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDialog("extend")}>
            <HardDrive className="h-4 w-4" />
            Extend Size
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDialog("retype")}>
            <Wand2 className="h-4 w-4" />
            Change Type
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDialog("attach")}>
            <Plug className="h-4 w-4" />
            Attach to Instance
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDialog("detach")}>
            <Scissors className="h-4 w-4" />
            Detach from Instance
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => openDialog("snapshot-create")}
          >
            <HardDrive className="h-4 w-4" />
            Create Snapshot
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => openDialog("snapshot-delete")}
          >
            <Trash2 className="h-4 w-4" />
            Delete Snapshot
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => openDialog("backup-create")}
          >
            <HardDrive className="h-4 w-4" />
            Create Backup
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => openDialog("backup-delete")}
          >
            <Trash2 className="h-4 w-4" />
            Delete Backup
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onClick={() => openDialog("backup-restore")}
          >
            <HardDrive className="h-4 w-4" />
            Restore Backup
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDialog("delete")}>
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Delete Volume
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VolumeActionDialog dialog="extend">
        <DialogHeader>
          <DialogTitle>Extend Volume</DialogTitle>
          <DialogDescription>
            Increase the capacity of this volume. This operation is irreversible.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleExtend} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="extend-size">New Size (GB)</Label>
            <Input
              id="extend-size"
              type="number"
              min={volume.size + 1}
              value={extendSize}
              onChange={(event) => setExtendSize(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Current size: {volume.size} GB. Volume must be in <strong>available</strong> state.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Extending…" : "Extend Volume"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="retype">
        <DialogHeader>
          <DialogTitle>Change Volume Type</DialogTitle>
          <DialogDescription>
            Move this volume to another type. Migration policy determines whether data migration is
            allowed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleRetype} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-volume-type">New Volume Type</Label>
            <Input
              id="new-volume-type"
              placeholder="e.g., fast-ssd"
              value={newVolumeType}
              onChange={(event) => setNewVolumeType(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="migration-policy">Migration Policy</Label>
            <select
              id="migration-policy"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={migrationPolicy}
              onChange={(event) =>
                setMigrationPolicy(event.target.value === "on-demand" ? "on-demand" : "never")
              }
            >
              <option value="never">Never</option>
              <option value="on-demand">On-demand</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Updating…" : "Change Type"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="delete">
        <DialogHeader>
          <DialogTitle>Delete Volume</DialogTitle>
          <DialogDescription>
            This action will permanently remove the volume and all associated data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">
            Ensure the volume is detached before deleting. Force delete will attempt removal even if
            the volume is in-use.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={() => handleDelete(false)}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={() => handleDelete(true)}>
              {isPending ? "Force Deleting…" : "Force Delete"}
            </Button>
          </DialogFooter>
        </div>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="attach">
        <DialogHeader>
          <DialogTitle>Attach Volume</DialogTitle>
          <DialogDescription>
            Provide the target instance and device to attach this volume.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAttach} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instance-id">Instance ID</Label>
            <Input
              id="instance-id"
              value={instanceId}
              onChange={(event) => setInstanceId(event.target.value)}
              required
              placeholder="Server UUID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mountpoint">Mountpoint</Label>
            <Input
              id="mountpoint"
              value={mountpoint}
              onChange={(event) => setMountpoint(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mode">Access Mode</Label>
            <select
              id="mode"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value === "ro" ? "ro" : "rw")
              }
            >
              <option value="rw">Read/Write</option>
              <option value="ro">Read-Only</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="host-name">Host Name (optional)</Label>
            <Input
              id="host-name"
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Attaching…" : "Attach Volume"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="detach">
        <DialogHeader>
          <DialogTitle>Detach Volume</DialogTitle>
          <DialogDescription>Select an attachment to detach from this volume.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleDetach} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="attachment">Attachment</Label>
            <select
              id="attachment"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={detachAttachmentId}
              onChange={(event) => setDetachAttachmentId(event.target.value)}
            >
              <option value="">Select attachment</option>
              {attachmentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={forceDetach}
              onCheckedChange={(checked) => setForceDetach(checked === true)}
            />
            Force detach (use with caution)
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Detaching…" : "Detach Volume"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="snapshot-create">
        <DialogHeader>
          <DialogTitle>Create Snapshot</DialogTitle>
          <DialogDescription>Capture the current state of this volume.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSnapshotCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snapshot-name">Name</Label>
            <Input
              id="snapshot-name"
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="snapshot-description">Description</Label>
            <Textarea
              id="snapshot-description"
              value={snapshotDescription}
              onChange={(event) => setSnapshotDescription(event.target.value)}
              rows={3}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={snapshotForce}
              onCheckedChange={(checked) => setSnapshotForce(checked === true)}
            />
            Force snapshot while volume is attached
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Snapshot"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="snapshot-delete">
        <DialogHeader>
          <DialogTitle>Delete Snapshot</DialogTitle>
          <DialogDescription>Select a snapshot to delete permanently.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-snapshot">Snapshot</Label>
            <select
              id="delete-snapshot"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedSnapshot}
              onChange={(event) => setSelectedSnapshot(event.target.value)}
            >
              <option value="">Select snapshot</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name || snapshot.id}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={isPending} onClick={handleSnapshotDelete}>
              {isPending ? "Deleting…" : "Delete Snapshot"}
            </Button>
          </DialogFooter>
        </div>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="backup-create">
        <DialogHeader>
          <DialogTitle>Create Backup</DialogTitle>
          <DialogDescription>
            Create a Cinder backup for off-host recovery of this volume.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleBackupCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backup-name">Name</Label>
            <Input
              id="backup-name"
              value={backupName}
              onChange={(event) => setBackupName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-description">Description</Label>
            <Textarea
              id="backup-description"
              value={backupDescription}
              onChange={(event) => setBackupDescription(event.target.value)}
              rows={3}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={backupIncremental}
              onCheckedChange={(checked) => setBackupIncremental(checked === true)}
            />
            Incremental backup
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={backupForce}
              onCheckedChange={(checked) => setBackupForce(checked === true)}
            />
            Force backup while volume is attached
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Backup"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="backup-delete">
        <DialogHeader>
          <DialogTitle>Delete Backup</DialogTitle>
          <DialogDescription>Select a backup to delete permanently.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-backup">Backup</Label>
            <select
              id="delete-backup"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedBackup}
              onChange={(event) => setSelectedBackup(event.target.value)}
            >
              <option value="">Select backup</option>
              {backups.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {backup.name || backup.id}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={isPending} onClick={handleBackupDelete}>
              {isPending ? "Deleting…" : "Delete Backup"}
            </Button>
          </DialogFooter>
        </div>
      </VolumeActionDialog>

      <VolumeActionDialog dialog="backup-restore">
        <DialogHeader>
          <DialogTitle>Restore Backup</DialogTitle>
          <DialogDescription>
            Restore a backup to an existing or new volume. Leave volume ID blank to create a new
            volume.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleBackupRestore} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="restore-backup">Backup</Label>
            <select
              id="restore-backup"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedBackup}
              onChange={(event) => setSelectedBackup(event.target.value)}
            >
              <option value="">Select backup</option>
              {backups.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {backup.name || backup.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="restore-volume-id">Target Volume ID (optional)</Label>
            <Input
              id="restore-volume-id"
              value={restoreVolumeId}
              onChange={(event) => setRestoreVolumeId(event.target.value)}
              placeholder="Existing volume ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restore-name">New Volume Name (optional)</Label>
            <Input
              id="restore-name"
              value={restoreName}
              onChange={(event) => setRestoreName(event.target.value)}
              placeholder="Name for restored volume"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Restoring…" : "Restore Backup"}
            </Button>
          </DialogFooter>
        </form>
      </VolumeActionDialog>
    </>
  );
}

