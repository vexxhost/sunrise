import { FolderTree, Gauge, Network, Share2 } from "lucide-react";

import { CreateResourceMenu } from "@/components/resources/CreateResourceMenu";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";
import { createActionsForService } from "@/lib/create-actions";
import { listShareNetworks, listShares } from "@/lib/openstack/manila-server";

export const dynamic = "force-dynamic";

export default async function SharedFileSystemPage() {
  const [{ snapshot }, shares, networks] = await Promise.all([
    loadCloudContext(),
    listShares(),
    listShareNetworks(),
  ]);
  const resources = [
    ...snapshot.personalResources.pinned,
    ...snapshot.personalResources.recent,
  ];
  const capacity = shares.reduce((total, share) => total + share.size, 0);
  const available = shares.filter(
    (share) => share.status === "available",
  ).length;
  const createActions = createActionsForService(
    snapshot.createActions,
    "shared-file-system",
  );
  const createShare = createActions.find(({ id }) => id === "share");
  const metrics: ServiceLandingMetric[] = [
    {
      icon: FolderTree,
      label: "Shares",
      value: String(shares.length),
      detail: `${available} available in the active project`,
    },
    {
      icon: Gauge,
      label: "Provisioned capacity",
      value: `${capacity} GiB`,
      detail: "Capacity requested across visible shares",
    },
    {
      icon: Network,
      label: "Share networks",
      value: String(networks.length),
      detail: "Project networks available to Manila",
    },
  ];

  return (
    <ServiceLandingPage
      title="Shared File System"
      description="Provision durable shared storage, control client access, and connect shares to project networks with OpenStack Manila."
      context={snapshot}
      serviceId="shared-file-system"
      actions={<CreateResourceMenu actions={createActions} />}
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Quick access"
        description="Manage shared storage and the network paths used to export it."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Shares",
              href: "/shared-file-systems/shares",
              icon: FolderTree,
              description:
                "Create, resize, export, and manage client access to shared file systems.",
              meta: `${shares.length} visible`,
              badge:
                available === shares.length ? "Available" : "Needs attention",
              createAction: createShare,
            },
            {
              name: "Share networks",
              href: "/shared-file-systems/share-networks",
              icon: Share2,
              description:
                "Inspect the Neutron networks and subnets used by Manila share servers.",
              meta: `${networks.length} visible`,
              badge: "Project scoped",
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceRecentResources
        resources={resources}
        kinds={["share"]}
        emptyMessage="No pinned or recently viewed shares in this project."
      />
    </ServiceLandingPage>
  );
}
