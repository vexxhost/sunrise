import {
  Camera,
  Cpu,
  HardDrive,
  ImageIcon,
  KeyRound,
  Network,
  Server,
  Shield,
} from "lucide-react";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { CreateResourceMenu } from "@/components/resources/CreateResourceMenu";
import { createActionsForService } from "@/lib/create-actions";
import { loadCloudContext } from "@/lib/cloud-context";
import {
  loadProjectOverview,
  type OverviewService,
} from "@/lib/openstack/overview";
import { quotaPercentage, type QuotaMetric } from "@/lib/openstack/quota";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatQuotaValue(value: number, unit?: QuotaMetric["unit"]) {
  return `${numberFormatter.format(value)}${unit ? ` ${unit}` : ""}`;
}

function metricSummary(service: OverviewService | undefined, metricId: string) {
  const metric = service?.metrics.find(({ id }) => id === metricId);
  if (service?.status !== "available" || !metric) {
    return {
      value: "-",
      detail: service?.message ?? "Usage is unavailable",
    };
  }

  const quota =
    metric.limit < 0
      ? "Unlimited quota"
      : `${formatQuotaValue(metric.limit, metric.unit)} quota`;
  const reserved = metric.reserved
    ? `${formatQuotaValue(metric.reserved, metric.unit)} reserved · `
    : "";
  const percentage = quotaPercentage(metric);

  return {
    value: formatQuotaValue(metric.used, metric.unit),
    detail: `${reserved}${quota}`,
    utilization:
      percentage === null || metric.level === "unlimited"
        ? undefined
        : {
            percentage,
            level: metric.level,
          },
  };
}

function currentMeta(summary: ReturnType<typeof metricSummary>) {
  return summary.value === "-" ? summary.detail : `${summary.value} current`;
}

export default async function ComputePage() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;
  const resources = [
    ...snapshot.personalResources.pinned,
    ...snapshot.personalResources.recent,
  ];
  const services = await loadProjectOverview({
    token: cloud.keystoneToken,
    regionId: snapshot.region.id ?? undefined,
    projectId: snapshot.project.id ?? undefined,
    catalog: cloud.catalog,
    serviceIds: ["compute", "storage", "network"],
  });
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const compute = serviceById.get("compute");
  const storage = serviceById.get("storage");
  const network = serviceById.get("network");
  const instances = metricSummary(compute, "instances");
  const volumes = metricSummary(storage, "volumes");
  const networks = metricSummary(network, "network");
  const securityGroups = metricSummary(network, "security_group");
  const keyPairs = metricSummary(compute, "key_pairs");
  const snapshots = metricSummary(storage, "snapshots");
  const metrics: ServiceLandingMetric[] = [
    { label: "Instances", icon: Server, ...instances },
    { label: "Volumes", icon: HardDrive, ...volumes },
    { label: "Networks", icon: Network, ...networks },
    { label: "Security groups", icon: Shield, ...securityGroups },
  ];
  const createActions = createActionsForService(
    snapshot.createActions,
    "compute",
  );
  const createById = new Map(
    createActions.map((action) => [action.id, action]),
  );

  return (
    <ServiceLandingPage
      title="Compute"
      description="Operate virtual machines and the images, storage, networking, and access resources that support them."
      context={snapshot}
      serviceId="compute"
      actions={<CreateResourceMenu actions={createActions} />}
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Virtual machines"
        description="Run instances and inspect the catalogs used to build them."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Instances",
              href: "/compute/instances",
              icon: Server,
              description:
                "Inspect virtual machines, status, addresses, and console access.",
              meta: currentMeta(instances),
              createAction: createById.get("instance"),
            },
            {
              name: "Images",
              href: "/compute/images",
              icon: ImageIcon,
              description:
                "Browse operating-system and workload images available to instances.",
              meta: "Glance image catalog",
              createAction: createById.get("image"),
            },
            {
              name: "Instance flavors",
              href: "/compute/instance-flavors",
              icon: Cpu,
              description: "Compare virtual CPU, memory, and disk profiles.",
              meta: "Nova flavor catalog",
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceLandingSection
        title="Block storage"
        description="Review persistent volumes and point-in-time snapshots."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Volumes",
              href: "/compute/volumes",
              icon: HardDrive,
              description:
                "Inspect persistent block devices and their attachments.",
              meta: currentMeta(volumes),
              createAction: createById.get("volume"),
            },
            {
              name: "Snapshots",
              href: "/compute/snapshots",
              icon: Camera,
              description: "Browse reusable point-in-time volume snapshots.",
              meta: currentMeta(snapshots),
              createAction: createById.get("snapshot"),
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceLandingSection
        title="Network and security"
        description="Inspect tenant networking and credentials used by instances."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Networks",
              href: "/compute/networks",
              icon: Network,
              description:
                "Review tenant networks, subnets, and connected resources.",
              meta: currentMeta(networks),
              createAction: createById.get("network"),
            },
            {
              name: "Security groups",
              href: "/compute/networks/security-groups",
              icon: Shield,
              description: "Review ingress and egress policy applied to ports.",
              meta: currentMeta(securityGroups),
              createAction: createById.get("security-group"),
            },
            {
              name: "Key pairs",
              href: "/compute/key-pairs",
              icon: KeyRound,
              description: "Review SSH public keys registered with Nova.",
              meta: currentMeta(keyPairs),
              createAction: createById.get("key-pair"),
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceRecentResources
        resources={resources}
        kinds={["instance", "volume", "image"]}
        emptyMessage="No recently viewed compute resources in this project."
      />
    </ServiceLandingPage>
  );
}
