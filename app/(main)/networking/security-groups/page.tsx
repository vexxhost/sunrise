import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import { makeQueryClient } from "@/lib/query-client";
import { dehydrateQueryClient } from "@/lib/query-hydration";
import { getSession } from "@/lib/session";
import { SecurityGroupsTableClient } from "../NetworkingTablesClient";
import { isCreateActionRequested } from "@/lib/create-actions";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  parseNeutronTagFilterSearchParams,
  type NeutronTagFilterSearchParams,
} from "@/lib/openstack/neutron-tag-filters";

type SecurityGroupSearchParams = NeutronTagFilterSearchParams & {
  create?: string | string[];
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SecurityGroupSearchParams>;
}) {
  const session = await getSession();
  if (!session.projectId || !session.regionId) return null;
  const pageSearchParams = await searchParams;
  const createRequested = isCreateActionRequested(
    pageSearchParams.create,
    "security-group",
  );
  const queryClient = makeQueryClient();
  const parsedTagFilter = parseNeutronTagFilterSearchParams(pageSearchParams);
  const capabilitiesPromise = discoverNetworkCapabilities(session.regionId);
  const tagFilterPromise = parsedTagFilter.filter
    ? capabilitiesPromise.then((capabilities) =>
        extensionSupport(
          capabilities,
          NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
          "Security group tag filters",
        ).status === "unsupported"
          ? undefined
          : parsedTagFilter.filter,
      )
    : Promise.resolve(undefined);
  await tagFilterPromise.then((tagFilter) =>
    queryClient.prefetchQuery(
      securityGroupsQueryOptions(
        session.regionId,
        session.projectId,
        tagFilter,
      ),
    ),
  );
  const capabilities = await capabilitiesPromise;
  const tagFilter = await tagFilterPromise;
  const statefulSupport = extensionSupport(
    capabilities,
    NEUTRON_STATEFUL_SECURITY_GROUP_EXTENSION,
    "Security group connection tracking",
  );
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Security group tag filters",
  );
  const tagFilterError =
    parsedTagFilter.error ??
    (parsedTagFilter.filter && tagSupport.status === "unsupported"
      ? tagSupport.message
      : undefined);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);
  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <SecurityGroupsTableClient
        key={createRequested ? "create" : "idle"}
        regionId={session.regionId}
        projectId={session.projectId}
        initiallyOpen={createRequested}
        statefulSupport={statefulSupport}
        tagFilter={tagFilter}
        tagFilterError={tagFilterError}
        tagSupport={tagSupport}
      />
    </QueryHydrationBoundary>
  );
}
