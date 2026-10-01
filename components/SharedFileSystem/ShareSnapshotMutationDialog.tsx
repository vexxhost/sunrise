"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  deleteShareSnapshotAction,
  updateShareSnapshotAction,
} from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaShareSnapshot } from "@/types/openstack";

export type ShareSnapshotMutationKind = "edit" | "delete";

export function ShareSnapshotMutationDialog({
  action,
  onComplete,
  onOpenChange,
  scope,
  snapshot,
}: {
  action: ShareSnapshotMutationKind;
  onComplete: (deleted: boolean) => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  snapshot: ManilaShareSnapshot;
}) {
  const [name, setName] = useState(snapshot.name ?? "");
  const [description, setDescription] = useState(snapshot.description ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmationName = snapshot.name || snapshot.id;
  const invalid =
    (action === "edit" && !name.trim()) ||
    (action === "delete" && confirmation !== confirmationName);

  const submit = () => {
    if (invalid || pending) return;
    startTransition(async () => {
      setError(null);
      const result =
        action === "edit"
          ? await updateShareSnapshotAction(scope, snapshot.id, {
              name,
              description,
            })
          : await deleteShareSnapshotAction(scope, snapshot.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete(action === "delete");
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === "edit" ? <Pencil className="size-5" /> : null}
            {action === "delete" ? (
              <Trash2 className="size-5 text-destructive" />
            ) : null}
            {action === "edit"
              ? "Edit share snapshot"
              : "Delete share snapshot"}
          </DialogTitle>
          <DialogDescription>
            {action === "edit"
              ? "Update the snapshot display name and description."
              : "Permanently delete this point-in-time copy."}
          </DialogDescription>
        </DialogHeader>

        {action === "edit" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-share-snapshot-name">Name</Label>
              <Input
                id="edit-share-snapshot-name"
                value={name}
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-share-snapshot-description">
                Description
              </Label>
              <Textarea
                id="edit-share-snapshot-description"
                value={description}
                maxLength={255}
                onChange={(event) => setDescription(event.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                This operation cannot be undone. Type{" "}
                <strong>{confirmationName}</strong> to confirm.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-share-snapshot-confirmation">
                Snapshot name
              </Label>
              <Input
                id="delete-share-snapshot-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </div>
          </div>
        )}

        {error ? <MutationAlert>{error}</MutationAlert> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenChange}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={action === "delete" ? "destructive" : "default"}
            onClick={submit}
            disabled={pending || invalid}
          >
            {pending
              ? action === "delete"
                ? "Deleting"
                : "Saving"
              : action === "delete"
                ? "Delete snapshot"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
