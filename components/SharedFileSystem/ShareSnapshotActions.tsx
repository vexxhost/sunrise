"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus } from "lucide-react";

import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { sharesQueryOptions } from "@/hooks/queries/useManila";
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
import { createShareSnapshotAction } from "@/lib/openstack/manila-actions";
import { canCreateShareSnapshot } from "@/lib/openstack/manila-lifecycle";

export function ShareSnapshotActions({
  initiallyOpen = false,
  initialShareId = "",
  projectId,
  regionId,
}: {
  initiallyOpen?: boolean;
  initialShareId?: string;
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [shareId, setShareId] = useState(initialShareId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sharesOptions = useMemo(
    () => sharesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const shares = useQuery({
    ...sharesOptions,
    enabled: open && Boolean(projectId && regionId),
  });
  const eligibleShares = (shares.data ?? []).filter(canCreateShareSnapshot);

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setError(null);
    if (!nextOpen) clearCreateActionIntent();
    if (nextOpen) {
      setShareId(initialShareId);
      setName("");
      setDescription("");
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !shareId || !name.trim() || pending) return;

    startTransition(async () => {
      setError(null);
      const result = await createShareSnapshotAction(
        { projectId, regionId },
        { shareId, name, description: description || undefined },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share-snapshots"],
      });
      setDialogOpen(false);
    });
  };

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Create snapshot
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setDialogOpen(next)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="size-5" aria-hidden="true" />
                Create share snapshot
              </DialogTitle>
              <DialogDescription>
                Capture a point-in-time copy of an available Manila share.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="share-snapshot-source">Source share</Label>
              <Select
                value={shareId}
                onValueChange={setShareId}
                disabled={pending}
              >
                <SelectTrigger id="share-snapshot-source">
                  <SelectValue
                    placeholder={
                      shares.isLoading ? "Loading shares" : "Choose a share"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {eligibleShares.map((share) => (
                    <SelectItem key={share.id} value={share.id}>
                      {share.name || share.id} · {share.size} GiB ·{" "}
                      {share.share_proto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shares.isSuccess && eligibleShares.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No available snapshot-capable shares were found.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="share-snapshot-name">Name</Label>
              <Input
                id="share-snapshot-name"
                value={name}
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="share-snapshot-description">Description</Label>
              <Textarea
                id="share-snapshot-description"
                value={description}
                maxLength={255}
                onChange={(event) => setDescription(event.target.value)}
                disabled={pending}
              />
            </div>

            {error ? <MutationAlert>{error}</MutationAlert> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!shareId || !name.trim() || pending}
              >
                {pending ? "Creating" : "Create snapshot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
