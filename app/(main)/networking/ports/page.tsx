import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  networksQueryOptions,
  portsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { PortsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
  NEUTRON_PORT_SECURITY_EXTENSION,
  NEUTRON_SECURITY_GROUP_EXTENSION,
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
    "port",
  );
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      portsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      networksQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const capabilities = await capabilitiesPromise;
  const portSecuritySupport = extensionSupport(
    capabilities,
    NEUTRON_PORT_SECURITY_EXTENSION,
    "Port security",
  );
  const allowedAddressPairsSupport = extensionSupport(
    capabilities,
    NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION,
    "Allowed address pairs",
  );
  const securityGroupSupport = extensionSupport(
    capabilities,
    NEUTRON_SECURITY_GROUP_EXTENSION,
    "Security group assignment",
  );
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <PortsTableClient
        allowedAddressPairsSupport={allowedAddressPairsSupport}
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        portSecuritySupport={portSecuritySupport}
        securityGroupSupport={securityGroupSupport}
      />
    </QueryHydrationBoundary>
  );
}
