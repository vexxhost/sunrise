import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { loadBalancersQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { isCreateActionRequested } from "@/lib/create-actions";
import { microversionSupport } from "@/lib/openstack/capabilities";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
  OCTAVIA_TAGS_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
import { getSession } from "@/lib/session";
import { LoadBalancersClient } from "./LoadBalancersClient";

export default async function LoadBalancersPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const [capabilities, pageSearchParams] = await Promise.all([
    discoverLoadBalancerCapabilities(session.regionId),
    searchParams,
  ]);
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "load-balancer",
  );
  const tagSupport = microversionSupport(
    capabilities,
    OCTAVIA_TAGS_MICROVERSION,
    "Load balancer tags",
  );
  const availabilityZoneSupport = microversionSupport(
    capabilities,
    OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
    "Load balancer availability-zone placement",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="load balancer"
      queries={[loadBalancersQueryOptions(session.regionId, session.projectId)]}
    >
      <LoadBalancersClient
        availabilityZoneSupport={availabilityZoneSupport}
        initiallyOpen={createRequested}
        key={createRequested ? "create" : "idle"}
        projectId={session.projectId}
        regionId={session.regionId}
        tagSupport={tagSupport}
      />
    </DataTableHydrationBoundary>
  );
}
