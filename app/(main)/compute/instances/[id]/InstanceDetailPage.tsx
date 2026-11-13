import { getSession } from "@/lib/session";
import { InstanceDetailClient } from "./InstanceDetailClient";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import {
  serverQueryOptions,
  serverInterfacesQueryOptions,
  serverActionsQueryOptions,
  serverConsoleOutputQueryOptions,
  flavorsQueryOptions,
} from "@/hooks/queries/useServers";
import {
  networksQueryOptions,
  portQueryOptions,
  portsQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { imageQueryOptions } from "@/hooks/queries/useImages";
import { makeQueryClient } from "@/lib/query-client";
import type { InstanceDetailTab } from "./tabs";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { microversionSupport } from "@/lib/openstack/capabilities";
import {
  discoverComputeCapabilities,
  NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION,
} from "@/lib/openstack/capabilities-server";

interface InstanceDetailPageProps {
  id: string;
  activeTab: InstanceDetailTab;
}

export async function InstanceDetailPage({
  id,
  activeTab,
}: InstanceDetailPageProps) {
  const session = await getSession();
  const { regionId, projectId } = session;
  const attachmentPolicySupportPromise = regionId
    ? discoverComputeCapabilities(regionId).then((capabilities) =>
        microversionSupport(
          capabilities,
          NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION,
          "Changing delete-with-instance behavior",
        ),
      )
    : Promise.resolve({
        status: "unknown" as const,
        message:
          "Changing delete-with-instance behavior will be verified when used.",
      });

  // Fetch the server first so we can prefetch its dependent queries on the server.
  const queryClient = makeQueryClient();
  const serverQuery = serverQueryOptions(regionId, projectId, id);
  const interfacesQuery = serverInterfacesQueryOptions(regionId, projectId, id);
  const server = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(serverQuery),
    { kind: "instance", id },
  );
  const interfaceAttachments = await fetchOpenStackResourceOrRecover(
    queryClient.fetchQuery(interfacesQuery),
    { kind: "instance", id },
  );

  const attachedVolumeIds =
    server["os-extended-volumes:volumes_attached"]?.map(
      (volume: { id: string }) => volume.id,
    ) ?? [];
  const portIds = interfaceAttachments.map((attachment) => attachment.port_id);
  const queries: Array<any> = [
    serverQuery,
    interfacesQuery,
    securityGroupsQueryOptions(regionId, projectId),
    portsQueryOptions(regionId, projectId),
    networksQueryOptions(regionId, projectId),
    flavorsQueryOptions(regionId, projectId),
    serverActionsQueryOptions(regionId, projectId, id) as any,
    ...portIds.map((portId) => portQueryOptions(regionId, projectId, portId)),
  ];

  for (const volumeId of attachedVolumeIds) {
    queries.push(volumeQueryOptions(regionId, projectId, volumeId) as any);
  }

  if (server.image && typeof server.image === "object" && server.image.id) {
    queries.push(
      imageQueryOptions(regionId, projectId, server.image.id) as any,
    );
  }

  if (activeTab === "log") {
    queries.push(
      serverConsoleOutputQueryOptions(regionId, projectId, id, 35) as any,
    );
  }
  const attachmentPolicySupport = await attachmentPolicySupportPromise;

  return (
    <PrefetchHydrationBoundary queries={queries} queryClient={queryClient}>
      <InstanceDetailClient
        serverId={id}
        regionId={regionId}
        projectId={projectId}
        activeTab={activeTab}
        attachmentPolicySupport={attachmentPolicySupport}
      />
    </PrefetchHydrationBoundary>
  );
}
