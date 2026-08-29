import { Boxes, CircleHelp, Gauge, Network, Settings } from "lucide-react";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";
import { listClusterTemplatesAction } from "@/lib/openstack/magnum";
import { loadProjectOverview } from "@/lib/openstack/overview";
import { quotaPercentage } from "@/lib/openstack/quota";

export default async function KubernetesPage() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;
  const resources = [
    ...snapshot.personalResources.pinned,
    ...snapshot.personalResources.recent,
  ];
  const [services, templates] = await Promise.all([
    loadProjectOverview({
      token: cloud.keystoneToken,
      regionId: snapshot.region.id ?? undefined,
      projectId: snapshot.project.id ?? undefined,
      catalog: cloud.catalog,
      serviceIds: ["container-infra"],
    }),
    listClusterTemplatesAction({}, snapshot.region.id ?? undefined),
  ]);
  const clusterService = services[0];
  const clusterMetric = clusterService?.metrics.find(
    ({ id }) => id === "clusters",
  );
  const clusterCount =
    clusterService?.status === "available" && clusterMetric
      ? String(clusterMetric.used)
      : "-";
  const clusterDetail =
    clusterService?.status === "available" && clusterMetric
      ? clusterMetric.limit < 0
        ? "Unlimited quota"
        : `${clusterMetric.limit} cluster quota`
      : (clusterService?.message ?? "Usage is unavailable");
  const remainingCapacity =
    clusterService?.status !== "available" || !clusterMetric
      ? "-"
      : clusterMetric.limit < 0
        ? "Unlimited"
        : String(Math.max(0, clusterMetric.limit - clusterMetric.used));
  const clusterPercentage = clusterMetric
    ? quotaPercentage(clusterMetric)
    : null;
  const metrics: ServiceLandingMetric[] = [
    {
      icon: Boxes,
      label: "Clusters",
      value: clusterCount,
      detail: clusterDetail,
      utilization:
        clusterPercentage === null || clusterMetric?.level === "unlimited"
          ? undefined
          : {
              percentage: clusterPercentage,
              level: clusterMetric?.level ?? "normal",
            },
    },
    {
      icon: Gauge,
      label: "Available capacity",
      value: remainingCapacity,
      detail:
        remainingCapacity === "-"
          ? clusterDetail
          : remainingCapacity === "Unlimited"
            ? "No project hard limit"
            : "Clusters remaining in quota",
    },
    {
      icon: Settings,
      label: "Templates",
      value: String(templates.length),
      detail: "Kubernetes cluster templates",
    },
    {
      icon: CircleHelp,
      label: "Cluster health",
      value: "Unavailable",
      detail: "Magnum does not expose project-scoped health listing",
    },
  ];

  return (
    <ServiceLandingPage
      title="Kubernetes"
      description="Deploy and operate Magnum-backed Kubernetes clusters, templates, node groups, networking, and storage."
      context={snapshot}
      serviceId="kubernetes"
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Quick access"
        description="Inspect Kubernetes infrastructure available to the active project."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Clusters",
              href: "/kubernetes/clusters",
              icon: Boxes,
              description:
                "Inspect lifecycle status, Kubernetes versions, node groups, and API endpoints.",
              meta:
                clusterCount === "-"
                  ? clusterDetail
                  : `${clusterCount} current`,
            },
            {
              name: "Cluster templates",
              href: "/kubernetes/templates",
              icon: Settings,
              description:
                "Review Magnum templates, flavors, images, drivers, and visibility.",
              meta: `${templates.length} available`,
            },
            {
              name: "Load balancers",
              icon: Network,
              description:
                "Inspect load balancers associated with Kubernetes workloads.",
              badge: "Page planned",
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceRecentResources
        resources={resources}
        kinds={["cluster"]}
        emptyMessage="No pinned or recently viewed Kubernetes clusters in this project."
      />
    </ServiceLandingPage>
  );
}
