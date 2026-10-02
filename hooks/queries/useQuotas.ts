"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { getProjectQuotaServiceAction } from "@/lib/openstack/quota-actions";
import {
  quotaImpactIssues,
  quotaRequestImpacts,
  type QuotaRequest,
} from "@/lib/openstack/quota-impact";
import type {
  OverviewService,
  OverviewServiceId,
} from "@/lib/openstack/overview";

export function quotaQueryUnavailableMessage(
  query: {
    data?: OverviewService;
    isError: boolean;
    isLoading: boolean;
  },
  fallback = "Project quotas are unavailable. OpenStack will validate the request when it is submitted.",
) {
  if (query.isError) return fallback;
  if (!query.isLoading && query.data && query.data.status !== "available") {
    return query.data.message ?? fallback;
  }
  return undefined;
}

export function projectQuotaQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  serviceId: OverviewServiceId,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "project-quotas", serviceId],
    queryFn: () =>
      getProjectQuotaServiceAction(
        { projectId: projectId!, regionId },
        serviceId,
      ),
    enabled: Boolean(regionId && projectId),
    staleTime: 15_000,
  });
}

export function useProjectQuotaImpact({
  enabled,
  projectId,
  regionId,
  requests,
  serviceId,
}: {
  enabled: boolean;
  projectId?: string;
  regionId?: string;
  requests: QuotaRequest[];
  serviceId: OverviewServiceId;
}) {
  const query = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, serviceId),
    enabled: enabled && Boolean(regionId && projectId),
  });
  const metrics = query.data?.status === "available" ? query.data.metrics : [];
  const impacts = quotaRequestImpacts(metrics, requests);

  return {
    impacts,
    issues: quotaImpactIssues(impacts),
    loading: query.isLoading,
    metrics,
    query,
    unavailableMessage: quotaQueryUnavailableMessage(query),
  };
}
