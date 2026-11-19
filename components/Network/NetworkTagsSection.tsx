"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { updateNetworkTagsAction } from "@/lib/openstack/neutron-tag-actions";
import {
  parseNeutronTagsText,
  sameNeutronTags,
} from "@/lib/openstack/neutron-tags";
import type { Network } from "@/types/openstack";

export function NetworkTagsSection({
  network,
  owned,
  projectId,
  regionId,
  support,
}: {
  network: Network;
  owned: boolean;
  projectId: string;
  regionId: string;
  support: OpenStackFeatureSupport;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tags = network.tags ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = useMemo(() => parseNeutronTagsText(draft), [draft]);
  const changed = parsed.ok && !sameNeutronTags(parsed.tags, tags);
  const canEdit = owned && support.status !== "unsupported";

  if (support.status === "unsupported" && tags.length === 0) return null;

  const openEditor = () => {
    setDraft(tags.join("\n"));
    setError(null);
    setOpen(true);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed.ok || !changed) return;

    setError(null);
    startTransition(async () => {
      const result = await updateNetworkTagsAction(
        { projectId, regionId },
        network.id,
        {
          expectedRevisionNumber: network.revision_number,
          tags: parsed.tags,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
      router.refresh();
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tags className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Tags</h3>
        <Badge variant="outline">{tags.length}</Badge>
        {canEdit ? (
          <EditActionButton
            compact
            className="ml-auto"
            label="Edit network tags"
            onClick={openEditor}
          />
        ) : null}
      </div>

      {tags.length ? (
        <div className="flex flex-wrap gap-2 rounded-md border px-3 py-2.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="max-w-full">
              <span className="break-all font-mono">{tag}</span>
            </Badge>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No tags are configured.
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit network tags</DialogTitle>
            <DialogDescription>
              Replace the tags associated with this network.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="network-tags">Tags</Label>
              <Textarea
                id="network-tags"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={"environment:production\nmanaged-by:terraform"}
                rows={8}
                autoFocus
              />
            </div>
            {!parsed.ok ? (
              <MutationAlert>{parsed.error}</MutationAlert>
            ) : null}
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={!changed}>
                Save tags
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
