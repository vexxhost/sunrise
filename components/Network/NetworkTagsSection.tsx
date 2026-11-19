"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Tags, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { updateNetworkTagsAction } from "@/lib/openstack/neutron-tag-actions";
import {
  decodeNeutronTagFromEditor,
  encodeNeutronTagForEditor,
  formatNeutronTag,
  sameNeutronTags,
  validateNeutronTags,
} from "@/lib/openstack/neutron-tags";
import type { Network } from "@/types/openstack";

type TagDraft = {
  id: number;
  value: string;
};

type TagDraftSource = {
  revisionNumber?: number;
  tags: string[];
};

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
  const [draft, setDraft] = useState<TagDraft[]>([]);
  const [draftSource, setDraftSource] = useState<TagDraftSource>({ tags: [] });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextDraftId = useRef(0);
  const submissionInFlight = useRef(false);
  const draftTags = useMemo(
    () => draft.map((tag) => decodeNeutronTagFromEditor(tag.value)),
    [draft],
  );
  const parsed = useMemo(() => validateNeutronTags(draftTags), [draftTags]);
  const changed = parsed.ok && !sameNeutronTags(parsed.tags, draftSource.tags);
  const canEdit = owned && support.status !== "unsupported";

  if (support.status === "unsupported" && tags.length === 0) return null;

  const newDraft = (value: string): TagDraft => ({
    id: nextDraftId.current++,
    value,
  });
  const openEditor = () => {
    setDraft(tags.map((tag) => newDraft(encodeNeutronTagForEditor(tag))));
    setDraftSource({
      ...(network.revision_number !== undefined
        ? { revisionNumber: network.revision_number }
        : {}),
      tags: [...tags],
    });
    setError(null);
    setOpen(true);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed.ok || !changed || submissionInFlight.current) return;

    submissionInFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateNetworkTagsAction(
          { projectId, regionId },
          network.id,
          {
            ...(draftSource.revisionNumber !== undefined
              ? { expectedRevisionNumber: draftSource.revisionNumber }
              : {}),
            expectedTags: draftSource.tags,
            tags: parsed.tags,
          },
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setOpen(false);
        await queryClient.invalidateQueries({
          queryKey: [regionId, projectId],
        });
        router.refresh();
      } catch {
        setError("The network tags could not be saved. Try again.");
      } finally {
        submissionInFlight.current = false;
      }
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
              <span className="break-all whitespace-pre-wrap font-mono">
                {formatNeutronTag(tag)}
              </span>
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
          if (!pending && !submissionInFlight.current) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit network tags</DialogTitle>
            <DialogDescription>
              Replace the tags associated with this network.
            </DialogDescription>
          </DialogHeader>
          <form className="min-h-0 space-y-4 overflow-hidden" onSubmit={submit}>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Tags</span>
                <span className="text-xs text-muted-foreground">
                  {draft.length} configured
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Carriage returns are shown as <code>\r</code>; literal
                backslashes are shown as <code>\\</code>. The Networking service
                applies any cloud-specific tag count limit.
              </p>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {draft.map((tag, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
                    key={tag.id}
                  >
                    <Textarea
                      aria-label={`Tag ${index + 1}`}
                      value={tag.value}
                      disabled={pending}
                      onChange={(event) => {
                        if (submissionInFlight.current) return;
                        setError(null);
                        setDraft((current) =>
                          current.map((entry) =>
                            entry.id === tag.id
                              ? { ...entry, value: event.target.value }
                              : entry,
                          ),
                        );
                      }}
                      placeholder="environment:production"
                      rows={2}
                      className="font-mono"
                      autoFocus={index === 0}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      tone="danger"
                      aria-label={`Remove tag ${index + 1}`}
                      disabled={pending}
                      onClick={() => {
                        if (submissionInFlight.current) return;
                        setError(null);
                        setDraft((current) =>
                          current.filter((entry) => entry.id !== tag.id),
                        );
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {draft.length === 0 ? (
                  <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No tags are configured.
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (submissionInFlight.current) return;
                  setError(null);
                  setDraft((current) => [...current, newDraft("")]);
                }}
              >
                <Plus className="size-4" />
                Add tag
              </Button>
            </div>
            {!parsed.ok ? <MutationAlert>{parsed.error}</MutationAlert> : null}
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (!submissionInFlight.current) setOpen(false);
                }}
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
