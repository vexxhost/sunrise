import {
  Cable,
  Globe2,
  Network,
  Router,
  Shield,
  Waypoints,
  Workflow,
} from "lucide-react";
import { unstable_rethrow } from "next/navigation";

import { CreateResourceMenu } from "@/components/resources/CreateResourceMenu";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { createActionsForService } from "@/lib/create-actions";
import { loadCloudContext } from "@/lib/cloud-context";
import { createLogger } from "@/lib/logging";
import { listLoadBalancersAction } from "@/lib/openstack/octavia-actions";
import {
  loadProjectOverview,
  type OverviewService,
} from "@/lib/openstack/overview";
import { quotaPercentage, type QuotaMetric } from "@/lib/openstack/quota";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const logger = createLogger("networking.overview");

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
        : { percentage, level: metric.level },
  };
}

function currentMeta(summary: ReturnType<typeof metricSummary>) {
  return summary.value === "-" ? summary.detail : `${summary.value} current`;
}

export default async function NetworkingPage() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;
  const loadBalancersAvailable = snapshot.destinations.some(
    ({ id, status }) =>
      id === "networking.load-balancers" && status !== "unavailable",
  );
  const [services, loadBalancerResult] = await Promise.all([
    loadProjectOverview({
      token: cloud.keystoneToken,
      regionId: snapshot.region.id ?? undefined,
      projectId: snapshot.project.id ?? undefined,
      catalog: cloud.catalog,
      serviceIds: ["network"],
    }),
    loadBalancersAvailable
      ? listLoadBalancersAction(
          snapshot.region.id ?? undefined,
          snapshot.project.id ?? undefined,
        )
          .then((loadBalancers) => ({
            ok: true as const,
            loadBalancers,
          }))
          .catch((error) => {
            unstable_rethrow(error);
            logger.warn("load-balancer-count-unavailable", {
              error,
              regionId: snapshot.region.id,
            });
            return { ok: false as const, loadBalancers: [] };
          })
      : Promise.resolve({ ok: false as const, loadBalancers: [] }),
  ]);
  const network = services.find(({ id }) => id === "network");
  const networks = metricSummary(network, "network");
  const ports = metricSummary(network, "port");
  const routers = metricSummary(network, "router");
  const floatingIps = metricSummary(network, "floatingip");
  const securityGroups = metricSummary(network, "security_group");
  const loadBalancers = loadBalancerResult.ok
    ? {
        value: String(loadBalancerResult.loadBalancers.length),
        detail: "Current project inventory",
      }
    : { value: "-", detail: "Usage is unavailable" };
  const neutronAvailable = snapshot.destinations.some(
    ({ id, status }) =>
      id === "networking.networks" && status !== "unavailable",
  );
  const metrics: ServiceLandingMetric[] = [
    ...(neutronAvailable
      ? [
          { label: "Networks", icon: Network, ...networks },
          { label: "Ports", icon: Cable, ...ports },
          { label: "Routers", icon: Router, ...routers },
          { label: "Floating IPs", icon: Globe2, ...floatingIps },
        ]
      : []),
    ...(loadBalancersAvailable
      ? [{ label: "Load balancers", icon: Waypoints, ...loadBalancers }]
      : []),
  ];
  const createActions = createActionsForService(
    snapshot.createActions,
    "networking",
  );
  const createById = new Map(
    createActions.map((action) => [action.id, action]),
  );

  return (
    <ServiceLandingPage
      title="Networking"
      description="Operate project connectivity, routing, public addresses, and traffic security."
      context={snapshot}
      serviceId="networking"
      actions={<CreateResourceMenu actions={createActions} />}
      metrics={metrics}
    >
      {neutronAvailable ? (
        <ServiceLandingSection
          title="Connectivity"
          description="Build and inspect the virtual network paths used by cloud resources."
        >
          <ServiceResourceGrid
            resources={[
              {
                name: "Networks",
                href: "/networking/networks",
                icon: Network,
                description:
                  "Manage project networks, subnets, address pools, and DHCP settings.",
                meta: currentMeta(networks),
                createAction: createById.get("network"),
              },
              {
                name: "Routers",
                href: "/networking/routers",
                icon: Router,
                description:
                  "Connect subnets, external gateways, and custom static routes.",
                meta: currentMeta(routers),
                createAction: createById.get("router"),
              },
              {
                name: "Ports",
                href: "/networking/ports",
                icon: Cable,
                description:
                  "Inspect virtual interfaces, fixed addresses, and device ownership.",
                meta: currentMeta(ports),
                createAction: createById.get("port"),
              },
            ]}
          />
        </ServiceLandingSection>
      ) : null}

      {neutronAvailable ? (
        <ServiceLandingSection
          title="Addressing and security"
          description="Control public reachability and stateful traffic policy."
        >
          <ServiceResourceGrid
            resources={[
              {
                name: "Floating IPs",
                href: "/networking/floating-ips",
                icon: Globe2,
                description:
                  "Allocate public addresses and associate them with eligible ports.",
                meta: currentMeta(floatingIps),
                createAction: createById.get("floating-ip"),
              },
              {
                name: "Security groups",
                href: "/networking/security-groups",
                icon: Shield,
                description:
                  "Manage reusable ingress and egress rules applied to ports.",
                meta: currentMeta(securityGroups),
                createAction: createById.get("security-group"),
              },
              {
                name: "Network topology",
                href: "/networking/topology",
                icon: Workflow,
                description:
                  "Explore relationships between networks, routers, ports, and instances.",
                meta: "Interactive project map",
              },
            ]}
          />
        </ServiceLandingSection>
      ) : null}

      {loadBalancersAvailable ? (
        <ServiceLandingSection
          title="Traffic delivery"
          description="Inspect virtual IPs and the listener, pool, and member topology serving application traffic."
        >
          <ServiceResourceGrid
            resources={[
              {
                name: "Load balancers",
                href: "/networking/load-balancers",
                icon: Waypoints,
                description:
                  "Inspect Octavia virtual IPs, listeners, pools, members, and health.",
                meta: currentMeta(loadBalancers),
              },
            ]}
          />
        </ServiceLandingSection>
      ) : null}
    </ServiceLandingPage>
  );
}
