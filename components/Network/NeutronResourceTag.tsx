import Link from "next/link";
import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
