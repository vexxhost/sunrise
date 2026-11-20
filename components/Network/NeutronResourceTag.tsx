"use client";

import Link from "next/link";
import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  neutronTagFilterError,
  neutronTagFilterHref,
  type NeutronTagFilter,
} from "@/lib/openstack/neutron-tag-filters";
import { formatNeutronTag } from "@/lib/openstack/neutron-tags";
import { cn } from "@/lib/utils";

export type NeutronTaggableResourceType =
  "network" | "router" | "floating-ip" | "security-group" | "port";

const RESOURCE_FILTERS: Record<
  NeutronTaggableResourceType,
  { collectionPath: string; pluralLabel: string }
> = {
  network: {
    collectionPath: "/networking/networks",
    pluralLabel: "networks",
  },
  router: {
    collectionPath: "/networking/routers",
    pluralLabel: "routers",
  },
  "floating-ip": {
    collectionPath: "/networking/floating-ips",
    pluralLabel: "floating IPs",
  },
  "security-group": {
    collectionPath: "/networking/security-groups",
    pluralLabel: "security groups",
  },
  port: {
    collectionPath: "/networking/ports",
    pluralLabel: "ports",
  },
};

export function NeutronResourceTag({
  className,
  resourceType,
  support,
  tag,
  truncate = false,
}: {
  className?: string;
  resourceType: NeutronTaggableResourceType;
  support: OpenStackFeatureSupport;
  tag: string;
  truncate?: boolean;
}) {
  const label = formatNeutronTag(tag);
  const resourceFilter = RESOURCE_FILTERS[resourceType];
  const filter: NeutronTagFilter = { mode: "all", tags: [tag] };
  const filterError = neutronTagFilterError(filter);
  const filteringUnavailable = support.status === "unsupported";
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

  if (filteringUnavailable || filterError) {
    return (
      <Badge
        variant="secondary"
        className={cn("max-w-full", className)}
        title={
          filteringUnavailable
            ? support.message || "Tag filtering is unavailable in this cloud."
            : "This tag cannot be represented exactly in a list filter."
        }
      >
        {content}
      </Badge>
    );
  }

  const actionLabel = `Show ${resourceFilter.pluralLabel} tagged ${label}`;
  return (
    <Badge asChild variant="secondary" className={cn("max-w-full", className)}>
      <Link
        href={neutronTagFilterHref(resourceFilter.collectionPath, filter)}
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

export function NeutronResourceTagList({
  resourceType,
  support,
  tags,
  visibleCount = 2,
}: {
  resourceType: NeutronTaggableResourceType;
  support: OpenStackFeatureSupport;
  tags: string[];
  visibleCount?: number;
}) {
  const visibleTags = tags.slice(0, visibleCount);
  const additionalTags = tags.slice(visibleCount);
  const additionalCount = additionalTags.length;

  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {visibleTags.map((tag) => (
        <NeutronResourceTag
          key={tag}
          className="max-w-48"
          resourceType={resourceType}
          support={support}
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
                Select a tag to show matching resources.
              </p>
            </div>
            <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {additionalTags.map((tag) => (
                <NeutronResourceTag
                  key={tag}
                  resourceType={resourceType}
                  support={support}
                  tag={tag}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
