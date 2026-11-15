import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { loadBalancersQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { getSession } from "@/lib/session";
import { LoadBalancersClient } from "./LoadBalancersClient";

export default async function LoadBalancersPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="load balancer"
      queries={[loadBalancersQueryOptions(session.regionId, session.projectId)]}
    >
      <LoadBalancersClient
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </DataTableHydrationBoundary>
  );
}
