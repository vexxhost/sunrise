"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

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
import { updateShareNetworkAction } from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaShareNetwork } from "@/types/openstack";

export function ShareNetworkMutationDialog({
  network,
  onComplete,
  onOpenChange,
  scope,
}: {
  network: ManilaShareNetwork;
  onComplete: () => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
}) {
  const [name, setName] = useState(network.name ?? "");
  const [description, setDescription] = useState(network.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalid = !name.trim();

  const submit = () => {
    if (invalid || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await updateShareNetworkAction(scope, network.id, {
        name,
        description,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" aria-hidden="true" />
            Edit share network
          </DialogTitle>
          <DialogDescription>
            Update the display name and description. Existing subnet placement
            and attached share servers are not changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-share-network-name">Name</Label>
            <Input
              id="edit-share-network-name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-share-network-description">Description</Label>
            <Textarea
              id="edit-share-network-description"
              value={description}
              maxLength={255}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
            />
          </div>
        </div>

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
          <Button type="button" onClick={submit} disabled={pending || invalid}>
            {pending ? "Saving" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
