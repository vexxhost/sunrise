"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Tags, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  glanceTagFilterError,
  glanceTagFilterShareUrl,
  type GlanceTagFilter,
  withGlanceTagFilter,
} from "@/lib/openstack/glance-tag-filters";

export function ImageTagFilterControl({
  filter,
  initialError,
}: {
  filter?: GlanceTagFilter;
  initialError?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(filter?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const navigate = (nextFilter?: GlanceTagFilter) => {
    const next = withGlanceTagFilter(searchParams.toString(), nextFilter);
    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
    setOpen(false);
  };

  const addInputTag = () => {
    if (tagInput.length === 0) return tags;
    const nextTags = [...tags, tagInput];
    const nextError = glanceTagFilterError({ tags: nextTags });
    if (nextError) {
      setError(nextError);
      return null;
    }
    setTags(nextTags);
    setTagInput("");
    setError(null);
    return nextTags;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTags = tagInput.length > 0 ? addInputTag() : tags;
    if (!nextTags) return;
    const nextFilter = { tags: nextTags } satisfies GlanceTagFilter;
    const nextError = glanceTagFilterError(nextFilter);
    if (nextError) {
      setError(nextError);
      return;
    }
    navigate(nextFilter);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        if (nextOpen) {
          setTags(filter?.tags ?? []);
          setTagInput("");
          setError(initialError ?? null);
          setShareUrl(glanceTagFilterShareUrl(window.location.href));
          setShareError(null);
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          aria-invalid={Boolean(initialError)}
          aria-label={
            filter?.tags.length
              ? `Tag filter, ${filter.tags.length} active`
              : "Tag filter"
          }
        >
          <Tags className="size-4" />
          Tags
          {filter?.tags.length ? (
            <Badge variant="secondary">{filter.tags.length}</Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-2rem))]" align="start">
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <p className="text-sm font-medium">Match all tags</p>
            <p className="text-xs text-muted-foreground">
              Images must contain every selected tag.
            </p>
          </div>

          {tags.length ? (
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {tags.map((tag, index) => (
                <Badge
                  key={`${tag}-${index}`}
                  variant="secondary"
                  className="max-w-full gap-1 pl-2"
                >
                  <span className="truncate font-mono">{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => {
                      setTags((current) =>
                        current.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      );
                      setError(null);
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="glance-tag-filter">
              Tag
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <Input
                id="glance-tag-filter"
                className="font-mono"
                value={tagInput}
                placeholder="env:test"
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setTagInput(event.target.value);
                  setError(null);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Add tag filter"
                disabled={tagInput.length === 0}
                onClick={addInputTag}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={!filter && !initialError}
              onClick={() => navigate()}
            >
              Clear
            </Button>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {filter ? (
                <CopyButton
                  value={shareUrl}
                  label="Copy filtered view"
                  copiedLabel="Link copied"
                  showLabel
                  variant="outline"
                  disabled={!shareUrl || pending}
                  onCopy={() => setShareError(null)}
                  onError={() =>
                    setShareError("Could not copy the filtered view link.")
                  }
                />
              ) : null}
              <Button type="submit" loading={pending}>
                Apply
              </Button>
            </div>
          </div>
          {shareError ? (
            <p className="text-xs text-destructive" role="alert">
              {shareError}
            </p>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
