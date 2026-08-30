"use client";

import { useState, useTransition } from "react";

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
import { deleteImageAction, updateImageAction } from "@/lib/openstack/glance-actions";
import type { Image, ImageVisibility } from "@/types/openstack";

export type ImageMutationKind = "delete" | "edit";

interface ImageMutationDialogProps {
  action: ImageMutationKind;
  images: Image[];
  onComplete: () => Promise<void> | void;
  onDeleteSuccess?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  regionId?: string;
}

function parseTags(value: string) {
  return Array.from(
    new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)),
  );
}

export function ImageMutationDialog({
  action,
  images,
  onComplete,
  onDeleteSuccess,
  onOpenChange,
  projectId,
  regionId,
}: ImageMutationDialogProps) {
  const image = images[0];
  const [name, setName] = useState(image?.name || "");
  const [visibility, setVisibility] = useState<ImageVisibility>(
    image?.visibility || "private",
  );
  const [minDisk, setMinDisk] = useState(String(image?.min_disk ?? 0));
  const [minRam, setMinRam] = useState(String(image?.min_ram ?? 0));
  const [tags, setTags] = useState((image?.tags ?? []).join(", "));
  const [isProtected, setIsProtected] = useState(image?.protected ?? false);
  const [isHidden, setIsHidden] = useState(image?.os_hidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!image) return null;
  const close = () => {
    setError(null);
    onOpenChange(false);
  };

  const runDelete = () => {
    if (!projectId || !regionId) return;
    startTransition(async () => {
      const results = await Promise.all(
        images.map((selected) =>
          deleteImageAction({ projectId, regionId }, selected.id),
        ),
      );
      const failures = results.flatMap((result) =>
        result.ok ? [] : [result.error.message],
      );
      if (failures.length) {
        void onComplete();
        setError(failures[0]);
        return;
      }
      close();
      void onComplete();
      void onDeleteSuccess?.();
    });
  };

  if (action === "delete") {
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Delete images?"
        description="This permanently removes the selected image records and their stored data. Protected images must be unprotected first."
        confirmLabel="Delete images"
        pendingLabel="Deleting"
        pending={isPending}
        error={error}
        variant="destructive"
        onConfirm={runDelete}
      >
        <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
          {images.map((selected) => (
            <div key={selected.id} className="truncate py-1">
              {selected.name || selected.id}
            </div>
          ))}
        </div>
      </MutationConfirmationDialog>
    );
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId) return;
    startTransition(async () => {
      const result = await updateImageAction(
        { projectId, regionId },
        image.id,
        {
          name,
          visibility,
          minDisk,
          minRam,
          protected: isProtected,
          hidden: isHidden,
          tags: parseTags(tags),
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      close();
      void onComplete();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit image</DialogTitle>
            <DialogDescription>
              Update project-managed metadata. The uploaded image data remains immutable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="edit-image-name">Name</Label>
              <Input
                id="edit-image-name"
                autoFocus
                maxLength={255}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="edit-image-visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value as ImageVisibility)}
                disabled={isPending}
              >
                <SelectTrigger id="edit-image-visibility"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["private", "shared", "community", "public"] as const).map(
                    (value) => (
                      <SelectItem key={value} value={value} className="capitalize">
                        {value}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-image-disk">Minimum disk (GiB)</Label>
              <Input
                id="edit-image-disk"
                type="number"
                min={0}
                step={1}
                value={minDisk}
                onChange={(event) => setMinDisk(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-image-ram">Minimum memory (MiB)</Label>
              <Input
                id="edit-image-ram"
                type="number"
                min={0}
                step={1}
                value={minRam}
                onChange={(event) => setMinRam(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="edit-image-tags">Tags</Label>
              <Input
                id="edit-image-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={isProtected}
                onCheckedChange={(value) => setIsProtected(Boolean(value))}
                disabled={isPending}
              />
              Protect from deletion
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={isHidden}
                onCheckedChange={(value) => setIsHidden(Boolean(value))}
                disabled={isPending}
              />
              Hide from default image lists
            </label>
          </div>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
