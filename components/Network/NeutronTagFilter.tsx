"use client";

import { ResourceTagFilter } from "@/components/resources/ResourceTagFilter";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  neutronTagFilterError,
  neutronTagFilterShareUrl,
  type NeutronTagFilter,
  withNeutronTagFilter,
} from "@/lib/openstack/neutron-tag-filters";
import { formatNeutronTag } from "@/lib/openstack/neutron-tags";

export function NeutronTagFilterControl({
  filter,
  initialError,
  support,
}: {
  filter?: NeutronTagFilter;
  initialError?: string;
  support: OpenStackFeatureSupport;
}) {
  return (
    <ResourceTagFilter
      filter={filter}
      formatTag={formatNeutronTag}
      initialError={initialError}
      shareUrl={neutronTagFilterShareUrl}
      unavailable={support.status === "unsupported"}
      validate={neutronTagFilterError}
      withFilter={withNeutronTagFilter}
    />
  );
}
