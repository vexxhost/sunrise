import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  addressGroupsQueryOptions,
  projectAddressGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ADDRESS_GROUP_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { AddressGroupsClient } from "./AddressGroupsClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const capabilities = await discoverNetworkCapabilities(session.regionId);
  const support = extensionSupport(
    capabilities,
    NEUTRON_ADDRESS_GROUP_EXTENSION,
    "Network address groups",
  );

  if (support.status === "unsupported") {
    return (
      <div className="rounded-md border border-dashed px-6 py-10 text-center">
        <h2 className="text-lg font-semibold">
          Address groups are unavailable
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          {support.message}
        </p>
      </div>
    );
  }

  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "address-group",
  );
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(
      addressGroupsQueryOptions(session.regionId, session.projectId),
    ),
    queryClient.prefetchQuery(
      projectAddressGroupsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);

  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <AddressGroupsClient
        key={createRequested ? "create" : "idle"}
        initiallyOpen={createRequested}
        projectId={session.projectId}
        regionId={session.regionId}
        support={support}
      />
    </QueryHydrationBoundary>
  );
}
