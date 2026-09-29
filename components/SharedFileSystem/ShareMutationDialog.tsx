"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil, Scaling, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  deleteShareAction,
  resizeShareAction,
  updateShareAction,
} from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaShare } from "@/types/openstack";

export type ShareMutationKind = "edit" | "resize" | "delete";

const actionCopy: Record<
  ShareMutationKind,
  { title: string; description: string }
> = {
  edit: {
    title: "Edit share",
    description: "Update the display details and project visibility.",
  },
  resize: {
    title: "Resize share",
    description:
      "Extend or shrink the share. Shrinking may be rejected when the backend cannot safely reclaim the requested capacity.",
  },
  delete: {
    title: "Delete share",
    description:
      "Permanently delete the share and its data. Existing snapshots, replicas, or active dependencies can block deletion.",
  },
};

export function ShareMutationDialog({
  action,
  onComplete,
  onOpenChange,
  scope,
  share,
}: {
  action: ShareMutationKind;
  onComplete: (deleted: boolean) => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  share: ManilaShare;
}) {
  const [name, setName] = useState(share.name ?? "");
  const [description, setDescription] = useState(share.description ?? "");
  const [isPublic, setIsPublic] = useState(Boolean(share.is_public));
  const [size, setSize] = useState(String(share.size));
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = actionCopy[action];
  const confirmationName = share.name || share.id;
  const invalid =
    (action === "edit" && !name.trim()) ||
    (action === "resize" &&
      (!Number.isInteger(Number(size)) ||
        Number(size) < 1 ||
        Number(size) === share.size)) ||
    (action === "delete" && confirmation !== confirmationName);

  const submit = () => {
    if (invalid || pending) return;
    startTransition(async () => {
      setError(null);
      const result =
        action === "edit"
          ? await updateShareAction(scope, share.id, {
              name,
              description,
              isPublic,
            })
          : action === "resize"
            ? await resizeShareAction(scope, share.id, { newSize: size })
            : await deleteShareAction(scope, share.id);

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
            {action === "resize" ? <Scaling className="size-5" /> : null}
            {action === "delete" ? (
              <Trash2 className="size-5 text-destructive" />
            ) : null}
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {action === "edit" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-share-name">Name</Label>
              <Input
                id="edit-share-name"
                value={name}
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-share-description">Description</Label>
              <Textarea
                id="edit-share-description"
                value={description}
                maxLength={255}
                onChange={(event) => setDescription(event.target.value)}
                disabled={pending}
              />
            </div>
            <label className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={isPublic}
                onCheckedChange={(checked) => setIsPublic(checked === true)}
                disabled={pending}
              />
              <span>
                <span className="block text-sm font-medium">
                  Public visibility
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Visibility does not grant mount access. Access rules remain
                  authoritative.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {action === "resize" ? (
          <div className="space-y-1.5">
            <Label htmlFor="share-new-size">New capacity (GiB)</Label>
            <Input
              id="share-new-size"
              type="number"
              min={1}
              step={1}
              value={size}
              onChange={(event) => setSize(event.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Current capacity: {share.size} GiB.
            </p>
          </div>
        ) : null}

        {action === "delete" ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                This operation cannot be undone. Type{" "}
                <strong>{confirmationName}</strong> to confirm.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-share-confirmation">Share name</Label>
              <Input
                id="delete-share-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </div>
          </div>
        ) : null}

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
              : copy.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
