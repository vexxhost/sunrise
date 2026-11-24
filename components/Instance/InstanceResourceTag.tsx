"use client";

import Link from "next/link";
import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  novaTagFilterError,
  novaTagFilterHref,
} from "@/lib/openstack/nova-tag-filters";
import { formatNovaTag } from "@/lib/openstack/nova-tags";
import { cn } from "@/lib/utils";

export function InstanceResourceTag({
  className,
  tag,
  truncate = false,
}: {
  className?: string;
  tag: string;
  truncate?: boolean;
}) {
  const filter = { mode: "all", tags: [tag] } as const;
  const filterError = novaTagFilterError(filter);
  const label = formatNovaTag(tag);
  const content = (
    <span
      className={
        truncate
          ? "truncate font-mono"
          : "break-all whitespace-pre-wrap font-mono"
      }
    >
      {label}
    </span>
  );

  if (filterError) {
    return (
      <Badge
        variant="secondary"
        className={cn("max-w-full", className)}
        title="This tag cannot be represented exactly in an instance list filter."
      >
        {content}
      </Badge>
    );
  }

  const actionLabel = `Show instances tagged ${label}`;
  return (
    <Badge asChild variant="secondary" className={cn("max-w-full", className)}>
      <Link
        href={novaTagFilterHref("/compute/instances", filter)}
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

export function InstanceResourceTagList({
  tags,
  visibleCount = 2,
}: {
  tags: string[];
  visibleCount?: number;
}) {
  const visibleTags = tags.slice(0, visibleCount);
  const additionalTags = tags.slice(visibleCount);
  const additionalCount = additionalTags.length;

  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {visibleTags.map((tag) => (
        <InstanceResourceTag
          key={tag}
          className="max-w-48"
          tag={tag}
          truncate
        />
      ))}
      {additionalCount ? (
        <Popover>
          <PopoverTrigger asChild>
            <Badge
              asChild
              variant="outline"
              className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
            >
              <button
                type="button"
                aria-label={`Show ${additionalCount} more ${additionalCount === 1 ? "tag" : "tags"}`}
              >
                +{additionalCount}
              </button>
            </Badge>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(24rem,calc(100vw-2rem))] space-y-3"
          >
            <div>
              <p className="text-sm font-medium">Additional tags</p>
              <p className="text-xs text-muted-foreground">
                Select a tag to show matching instances.
              </p>
            </div>
            <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {additionalTags.map((tag) => (
                <InstanceResourceTag key={tag} tag={tag} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
