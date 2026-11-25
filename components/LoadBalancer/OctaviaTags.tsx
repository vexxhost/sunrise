"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOctaviaTag,
  OCTAVIA_MAX_RESOURCE_TAG_LENGTH,
  OCTAVIA_MAX_RESOURCE_TAGS,
} from "@/lib/openstack/octavia-tags";
import {
  decodeTagFromEditor,
  encodeTagForEditor,
} from "@/lib/openstack/tag-editor";

export type OctaviaTagDraft = { id: string; text: string };

export function octaviaTagDraft(value = ""): OctaviaTagDraft {
  return { id: crypto.randomUUID(), text: encodeTagForEditor(value) };
}

export function octaviaTagsFromDrafts(drafts: OctaviaTagDraft[]) {
  return drafts
    .map(({ text }) => decodeTagFromEditor(text))
    .filter((tag) => tag.length > 0);
}

export function OctaviaTagList({ tags }: { tags?: string[] }) {
  if (!Array.isArray(tags)) {
    return <span className="text-muted-foreground">Unavailable</span>;
  }
  if (tags.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <span className="flex max-w-full flex-wrap gap-1">
      {tags.map((tag, index) => (
        <Badge
          className="max-w-full font-mono text-xs"
          key={`${index}-${tag}`}
          variant="secondary"
        >
          <span className="truncate" title={formatOctaviaTag(tag)}>
            {formatOctaviaTag(tag)}
          </span>
        </Badge>
      ))}
    </span>
  );
}

export function OctaviaTagsEditor({
  disabled = false,
  idPrefix,
  onChange,
  tags,
}: {
  disabled?: boolean;
  idPrefix: string;
  onChange: (tags: OctaviaTagDraft[]) => void;
  tags: OctaviaTagDraft[];
}) {
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Tags</h3>
          <p id={`${idPrefix}-help`} className="text-xs text-muted-foreground">
            Optional exact values. Each tag may contain up to{" "}
            {OCTAVIA_MAX_RESOURCE_TAG_LENGTH} characters, excluding commas and
            slashes. Carriage returns are shown as <code>\r</code>; literal
            backslashes are shown as <code>\\</code>.
          </p>
        </div>
        <Button
          aria-label="Add tag"
          disabled={disabled || tags.length >= OCTAVIA_MAX_RESOURCE_TAGS}
          onClick={() => onChange([...tags, octaviaTagDraft()])}
          size="icon-sm"
          title="Add tag"
          type="button"
          variant="outline"
        >
          <Plus />
        </Button>
      </div>
      {tags.length ? (
        <div className="space-y-2">
          {tags.map((tag, index) => (
            <div className="flex items-start gap-2" key={tag.id}>
              <Label className="sr-only" htmlFor={`${idPrefix}-${tag.id}`}>
                Tag {index + 1}
              </Label>
              <Textarea
                id={`${idPrefix}-${tag.id}`}
                aria-describedby={`${idPrefix}-help`}
                className="min-w-0 font-mono"
                disabled={disabled}
                onChange={(event) => {
                  const text = event.target.value;
                  onChange(
                    tags.map((currentTag) =>
                      currentTag.id === tag.id
                        ? { ...currentTag, text }
                        : currentTag,
                    ),
                  );
                }}
                placeholder="env:test"
                rows={2}
                value={tag.text}
              />
              <Button
                aria-label={`Remove tag ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange(
                    tags.filter((currentTag) => currentTag.id !== tag.id),
                  )
                }
                size="icon-sm"
                title="Remove tag"
                tone="danger"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tags will be applied.
        </p>
      )}
    </section>
  );
}
