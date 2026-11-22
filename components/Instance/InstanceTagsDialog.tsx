"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { updateServerTagsAction } from "@/lib/openstack/nova-tag-actions";
import {
  decodeNovaTagFromEditor,
  encodeNovaTagForEditor,
  NOVA_MAX_SERVER_TAGS,
  sameNovaTags,
  validateNovaTags,
} from "@/lib/openstack/nova-tags";
import type { Server } from "@/types/openstack";

type TagDraft = { id: number; value: string };

interface InstanceTagsDialogProps {
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
  server: Server;
}

export function InstanceTagsDialog({
  onComplete,
  onOpenChange,
  open,
  projectId,
  regionId,
  server,
}: InstanceTagsDialogProps) {
  const [sourceTags] = useState(() => [...(server.tags ?? [])]);
  const nextDraftId = useRef(sourceTags.length);
  const submissionInFlight = useRef(false);
  const [draft, setDraft] = useState<TagDraft[]>(() =>
    sourceTags.map((tag, index) => ({
      id: index,
      value: encodeNovaTagForEditor(tag),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draftTags = useMemo(
    () => draft.map((tag) => decodeNovaTagFromEditor(tag.value)),
    [draft],
  );
  const parsed = useMemo(() => validateNovaTags(draftTags), [draftTags]);
  const changed = parsed.ok && !sameNovaTags(parsed.tags, sourceTags);

  const close = () => {
    if (pending || submissionInFlight.current) return;
    setError(null);
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !projectId ||
      !regionId ||
      !parsed.ok ||
      !changed ||
      submissionInFlight.current
    ) {
      return;
    }

    submissionInFlight.current = true;
    setError(null);
    startTransition(async () => {
      let saved = false;
      try {
        const result = await updateServerTagsAction(
          { projectId, regionId },
          server.id,
          { expectedTags: sourceTags, tags: parsed.tags },
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        saved = true;
      } catch {
        setError("The instance tags could not be saved. Try again.");
      } finally {
        submissionInFlight.current = false;
      }

      if (!saved) return;
      onOpenChange(false);
      try {
        await onComplete();
      } catch {
        // The mutation succeeded; cached data will refresh on the next read.
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-x-hidden overflow-y-auto">
        <form className="min-w-0 space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit instance tags</DialogTitle>
            <DialogDescription>
              Replace the exact tags associated with this instance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Tags</span>
              <span className="text-xs text-muted-foreground">
                {draft.length} of {NOVA_MAX_SERVER_TAGS}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Each tag can contain up to 60 characters. Slashes and commas are
              not allowed. Carriage returns are shown as <code>\r</code>;
              literal backslashes are shown as <code>\\</code>.
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
              disabled={pending || draft.length >= NOVA_MAX_SERVER_TAGS}
              onClick={() => {
                if (submissionInFlight.current) return;
                setError(null);
                setDraft((current) => [
                  ...current,
                  { id: nextDraftId.current++, value: "" },
                ]);
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
              onClick={close}
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
  );
}
