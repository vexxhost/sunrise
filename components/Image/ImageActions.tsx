"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUp, Plus, X } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
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
import { createImageAction } from "@/lib/openstack/glance-actions";
import type { DiskFormat, ImageVisibility } from "@/types/openstack";

interface ImageActionsProps {
  projectId?: string;
  regionId?: string;
}

type UploadResult = {
  ok: boolean;
  error?: string;
  imageId?: string;
  requestId?: string;
};

const DISK_FORMATS: DiskFormat[] = [
  "qcow2",
  "raw",
  "iso",
  "vmdk",
  "vhd",
  "vhdx",
  "vdi",
  "ami",
  "ari",
  "aki",
  "ploop",
];
const VISIBILITIES: ImageVisibility[] = [
  "private",
  "shared",
  "community",
  "public",
];

function tagsFromText(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function uploadImageData({
  file,
  imageId,
  projectId,
  regionId,
  onProgress,
  onStoring,
}: {
  file: File;
  imageId: string;
  projectId: string;
  regionId: string;
  onProgress: (value: number) => void;
  onStoring: () => void;
}) {
  return new Promise<UploadResult>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/compute/images/${encodeURIComponent(imageId)}/upload`);
    request.setRequestHeader("X-Sunrise-Project-Id", projectId);
    request.setRequestHeader("X-Sunrise-Region-Id", regionId);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.upload.onload = onStoring;
    request.onload = () => {
      try {
        resolve(JSON.parse(request.responseText) as UploadResult);
      } catch {
        resolve({
          ok: false,
          error: request.responseText || `Upload failed with ${request.status}.`,
        });
      }
    };
    request.onerror = () => resolve({ ok: false, error: "Image upload failed." });
    request.send(file);
  });
}

export function ImageActions({ projectId, regionId }: ImageActionsProps) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [diskFormat, setDiskFormat] = useState<DiskFormat>("qcow2");
  const [visibility, setVisibility] = useState<ImageVisibility>("private");
  const [minDisk, setMinDisk] = useState("0");
  const [minRam, setMinRam] = useState("0");
  const [tags, setTags] = useState("");
  const [isProtected, setIsProtected] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"catalog" | "sending" | "storing" | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setFile(null);
    setDiskFormat("qcow2");
    setVisibility("private");
    setMinDisk("0");
    setMinRam("0");
    setTags("");
    setIsProtected(false);
    setIsHidden(false);
    setError(null);
    setPhase(null);
    setProgress(0);
  };

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) reset();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !file) return;

    startTransition(async () => {
      setError(null);
      setPhase("catalog");
      const created = await createImageAction(
        { projectId, regionId },
        {
          name,
          diskFormat,
          containerFormat: "bare",
          visibility,
          minDisk,
          minRam,
          protected: isProtected,
          hidden: isHidden,
          tags: tagsFromText(tags),
        },
      );
      if (!created.ok) {
        setPhase(null);
        setError(created.error.message);
        return;
      }

      setPhase("sending");
      const uploaded = await uploadImageData({
        file,
        imageId: created.data.id,
        projectId,
        regionId,
        onProgress: setProgress,
        onStoring: () => setPhase("storing"),
      });
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "images"],
      });
      if (!uploaded.ok) {
        setPhase(null);
        setError(
          `Image record ${created.data.id} was created, but its data could not be uploaded. ${uploaded.error ?? "Try deleting the queued image and upload again."}`,
        );
        return;
      }

      setProgress(100);
      setPhase(null);
      setOpen(false);
    });
  };

  const phaseText =
    phase === "catalog"
      ? "Creating image record"
      : phase === "sending"
        ? `Sending ${progress}%`
        : phase === "storing"
          ? "Glance is storing and validating the image"
          : null;
  const phaseStatus =
    phase === "catalog"
      ? "Creating"
      : phase === "sending"
        ? "Uploading"
        : phase === "storing"
          ? "Saving"
          : null;

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="size-4" />
        Upload image
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => !isPending && setDialogOpen(nextOpen)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageUp className="size-5" />
                Upload image
              </DialogTitle>
              <DialogDescription>
                Create project image metadata, then stream the selected file to
                Glance. Image data is immutable after a successful upload.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="image-name">Name</Label>
                <Input
                  id="image-name"
                  autoFocus
                  maxLength={255}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="image-file">Image file</Label>
                <Input
                  ref={fileInput}
                  id="image-file"
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={isPending}
                  required={!file}
                />
                {file ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {file.name} · {(file.size / 1_048_576).toFixed(1)} MiB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove selected image file"
                      disabled={isPending}
                      onClick={() => {
                        setFile(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image-format">Disk format</Label>
                <Select
                  value={diskFormat}
                  onValueChange={(value) => setDiskFormat(value as DiskFormat)}
                  disabled={isPending}
                >
                  <SelectTrigger id="image-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISK_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>{format.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image-visibility">Visibility</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as ImageVisibility)}
                  disabled={isPending}
                >
                  <SelectTrigger id="image-visibility"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((value) => (
                      <SelectItem key={value} value={value} className="capitalize">
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image-min-disk">Minimum disk (GiB)</Label>
                <Input
                  id="image-min-disk"
                  type="number"
                  min={0}
                  step={1}
                  value={minDisk}
                  onChange={(event) => setMinDisk(event.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image-min-ram">Minimum memory (MiB)</Label>
                <Input
                  id="image-min-ram"
                  type="number"
                  min={0}
                  step={1}
                  value={minRam}
                  onChange={(event) => setMinRam(event.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="image-tags">Tags</Label>
                <Input
                  id="image-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="linux, production"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
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

            {phaseText ? (
              <div className="space-y-2" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full bg-primary transition-[width] ${phase !== "sending" ? "w-full animate-pulse" : ""}`}
                    style={phase === "sending" ? { width: `${progress}%` } : undefined}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {phaseStatus ? <ProgressStatusBadge label={phaseStatus} /> : null}
                  <p className="text-xs text-muted-foreground">{phaseText}</p>
                </div>
              </div>
            ) : null}
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
              <Button type="submit" disabled={!name.trim() || !file || isPending}>
                {isPending ? "Uploading" : "Upload image"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
