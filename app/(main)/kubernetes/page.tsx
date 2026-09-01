import {
  Activity,
  Boxes,
  Gauge,
  GitCommit,
  Network,
  Settings,
} from "lucide-react";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";
import {
  listClustersAction,
  listClusterTemplatesAction,
} from "@/lib/openstack/magnum";
import { loadProjectOverview } from "@/lib/openstack/overview";
import { quotaPercentage } from "@/lib/openstack/quota";
import { filterResourcePreferencesByLiveIds } from "@/lib/resource-preferences";

export default async function KubernetesPage() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;
  const [services, templates, clusters] = await Promise.all([
    loadProjectOverview({
      token: cloud.keystoneToken,
      regionId: snapshot.region.id ?? undefined,
      projectId: snapshot.project.id ?? undefined,
      catalog: cloud.catalog,
      serviceIds: ["container-infra"],
    }),
    listClusterTemplatesAction({}, snapshot.region.id ?? undefined),
    listClustersAction(
      {},
      snapshot.region.id ?? undefined,
      snapshot.project.id ?? undefined,
    ),
  ]);
  const liveClusterIds = clusters.map(({ uuid }) => uuid);
  const resources = filterResourcePreferencesByLiveIds(
    [
      ...snapshot.personalResources.pinned,
      ...snapshot.personalResources.recent,
    ],
    "cluster",
    liveClusterIds,
  );
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
  const healthCounts = clusters.reduce(
    (counts, cluster) => {
      const failed = cluster.status.toUpperCase().endsWith("_FAILED");
      const health = cluster.health_status?.toUpperCase();

      if (failed || (health && health !== "HEALTHY")) {
        counts.attention += 1;
      } else if (health === "HEALTHY") {
        counts.healthy += 1;
      } else {
        counts.pending += 1;
      }
      return counts;
    },
    { attention: 0, healthy: 0, pending: 0 },
  );
  const healthValue =
    clusters.length === 0
      ? "No clusters"
      : healthCounts.attention > 0
        ? `${healthCounts.attention} ${healthCounts.attention === 1 ? "needs" : "need"} attention`
        : healthCounts.pending > 0
          ? `${healthCounts.pending} pending`
          : "Healthy";
  const healthDetail =
    clusters.length === 0
      ? "No cluster health reports"
      : [
          `${healthCounts.healthy} healthy`,
          healthCounts.pending > 0 ? `${healthCounts.pending} pending` : null,
          healthCounts.attention > 0
            ? `${healthCounts.attention} unhealthy or failed`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
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
      icon: Activity,
      label: "Cluster health",
      value: healthValue,
      detail: healthDetail,
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
                  : `${clusterCount} in this project`,
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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <GitCommit aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Driver baseline: VEXXHOST magnum-cluster-api 0.38.2</span>
        <a
          className="font-mono hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
          href="https://github.com/vexxhost/magnum-cluster-api/commit/74e85108717104bfe754c7295173d3cf8f128190"
          rel="noreferrer"
          target="_blank"
        >
          74e85108717104bfe754c7295173d3cf8f128190
        </a>
      </div>
    </ServiceLandingPage>
  );
}
