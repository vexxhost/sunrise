import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import {
  addressGroupQueryOptions,
  isOwnedAddressGroup,
  projectAddressGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_ADDRESS_GROUP_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { AddressGroupDetailClient } from "./AddressGroupDetailClient";

export default async function Page({
  params,
}: PageProps<"/networking/address-groups/[id]">) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
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
  const queryClient = makeQueryClient();
  const query = addressGroupQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const [group, projectGroups] = await Promise.all([
    fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
      kind: "address-group",
      id,
    }),
    queryClient.fetchQuery(
      projectAddressGroupsQueryOptions(session.regionId, session.projectId),
    ),
  ]);
  const owned = isOwnedAddressGroup(group, session.projectId, projectGroups);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);

  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <AddressGroupDetailClient
        id={id}
        owned={owned}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </QueryHydrationBoundary>
  );
}
