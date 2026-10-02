"use server";

import { getSession } from "@/lib/session";
import {
  loadProjectOverview,
  type OverviewService,
  type OverviewServiceId,
} from "@/lib/openstack/overview";
import { mutationScopeError, type MutationScope } from "@/lib/mutations";

const supportedServices = new Set<OverviewServiceId>([
  "compute",
  "storage",
  "network",
  "shared-file-system",
  "container-infra",
  "key-manager",
]);

function unavailableQuotaService(
  id: OverviewServiceId,
  message: string,
): OverviewService {
  return {
    id,
    label: "Project quotas",
    href: "/quotas",
    status: "unavailable",
    metrics: [],
    message,
  };
}

export async function getProjectQuotaServiceAction(
  scope: MutationScope,
  serviceId: OverviewServiceId,
): Promise<OverviewService> {
  if (!supportedServices.has(serviceId)) {
    return unavailableQuotaService(serviceId, "Quota service is unsupported");
  }

  const session = await getSession();
  const scopeError = mutationScopeError(
    {
      projectId: session.projectId ?? "",
      regionId: session.regionId,
    },
    scope,
  );
  if (scopeError) {
    return unavailableQuotaService(serviceId, scopeError.message);
  }

  const [service] = await loadProjectOverview({
    token: session.keystoneProjectToken,
    regionId: session.regionId,
    projectId: session.projectId,
    serviceIds: [serviceId],
  });

  return (
    service ??
    unavailableQuotaService(serviceId, "Quota details are unavailable")
  );
}
