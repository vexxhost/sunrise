"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ListFilter, Plus, Tags, Trash2 } from "lucide-react";

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
import { updateNeutronResourceTagsAction } from "@/lib/openstack/neutron-tag-actions";
import {
  neutronTagFilterError,
  neutronTagFilterHref,
  type NeutronTagFilter,
} from "@/lib/openstack/neutron-tag-filters";
import {
  decodeNeutronTagFromEditor,
  encodeNeutronTagForEditor,
  formatNeutronTag,
  sameNeutronTags,
  validateNeutronTags,
} from "@/lib/openstack/neutron-tags";

type TaggableResourceType =
  "network" | "router" | "floating-ip" | "security-group" | "port";

const RESOURCE_LABELS: Record<
  TaggableResourceType,
  { collectionPath: string; label: string; pluralLabel: string; title: string }
> = {
  network: {
    collectionPath: "/networking/networks",
    label: "network",
    pluralLabel: "networks",
    title: "Network",
  },
  router: {
    collectionPath: "/networking/routers",
    label: "router",
    pluralLabel: "routers",
    title: "Router",
  },
  "floating-ip": {
    collectionPath: "/networking/floating-ips",
    label: "floating IP",
    pluralLabel: "floating IPs",
    title: "Floating IP",
  },
  "security-group": {
    collectionPath: "/networking/security-groups",
    label: "security group",
    pluralLabel: "security groups",
    title: "Security group",
  },
  port: {
    collectionPath: "/networking/ports",
    label: "port",
    pluralLabel: "ports",
    title: "Port",
  },
};

type TaggableResource = {
  id: string;
  revision_number?: number;
  tags?: string[];
};

type TagDraft = {
  id: number;
  value: string;
};

type TagDraftSource = {
  revisionNumber?: number;
  tags: string[];
};

export function NeutronResourceTagsSection({
  owned,
  projectId,
  regionId,
  resource,
  resourceType,
  support,
}: {
  owned: boolean;
  projectId: string;
  regionId: string;
  resource: TaggableResource;
  resourceType: TaggableResourceType;
  support: OpenStackFeatureSupport;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tags = resource.tags ?? [];
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
  const resourceLabel = RESOURCE_LABELS[resourceType];

  if (support.status === "unsupported" && tags.length === 0) return null;

  const newDraft = (value: string): TagDraft => ({
    id: nextDraftId.current++,
    value,
  });
  const openEditor = () => {
    setDraft(tags.map((tag) => newDraft(encodeNeutronTagForEditor(tag))));
    setDraftSource({
      ...(resource.revision_number !== undefined
        ? { revisionNumber: resource.revision_number }
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
        const result = await updateNeutronResourceTagsAction(
          { projectId, regionId },
          resourceType,
          resource.id,
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
        setError(
          `The ${resourceLabel.label} tags could not be saved. Try again.`,
        );
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
            label={`Edit ${resourceLabel.label} tags`}
            onClick={openEditor}
          />
        ) : null}
      </div>

      {tags.length ? (
        <div className="flex flex-wrap gap-2 rounded-md border px-3 py-2.5">
          {tags.map((tag) => (
            <ResourceTag
              key={tag}
              resourceType={resourceType}
              tag={tag}
            />
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
            <DialogTitle>Edit {resourceLabel.title} tags</DialogTitle>
            <DialogDescription>
              Replace the tags associated with this {resourceLabel.label}.
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

function ResourceTag({
  resourceType,
  tag,
}: {
  resourceType: TaggableResourceType;
  tag: string;
}) {
  const label = formatNeutronTag(tag);
  const resourceLabel = RESOURCE_LABELS[resourceType];
  const filter: NeutronTagFilter = { mode: "all", tags: [tag] };
  const filterError = neutronTagFilterError(filter);
  const content = (
    <span className="break-all whitespace-pre-wrap font-mono">{label}</span>
  );

  if (filterError) {
    return (
      <Badge
        variant="secondary"
        className="max-w-full"
        title="This tag cannot be represented exactly in a list filter."
      >
        {content}
      </Badge>
    );
  }

  const actionLabel = `Show ${resourceLabel.pluralLabel} tagged ${label}`;
  return (
    <Badge asChild variant="secondary" className="max-w-full">
      <Link
        href={neutronTagFilterHref(resourceLabel.collectionPath, filter)}
        aria-label={actionLabel}
        title={actionLabel}
        prefetch={false}
      >
        <ListFilter aria-hidden="true" />
        {content}
      </Link>
    </Badge>
  );
}
