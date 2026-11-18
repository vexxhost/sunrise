import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { floatingIpsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { FloatingIpsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_DNS_INTEGRATION_EXTENSION,
} from "@/lib/openstack/capabilities-server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "floating-ip",
  );
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(
    floatingIpsQueryOptions(session.regionId, session.projectId),
  );
  const dnsIntegrationSupport = extensionSupport(
    await capabilitiesPromise,
    NEUTRON_DNS_INTEGRATION_EXTENSION,
    "Floating IP DNS records",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <FloatingIpsTableClient
        key={createRequested ? "create" : "idle"}
        dnsIntegrationSupport={dnsIntegrationSupport}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
      />
    </QueryHydrationBoundary>
  );
}
