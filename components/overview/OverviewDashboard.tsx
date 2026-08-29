import Link from "next/link";
import type { ComponentType } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  Container,
  Database,
  FolderTree,
  Globe2,
  HardDrive,
  ImageIcon,
  KeyRound,
  Layers,
  Network,
  Server,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  OperationalCategory,
  OperationalFeed,
  OperationalSignal,
} from "@/lib/openstack/operational";
import type { OverviewService } from "@/lib/openstack/overview";
import { quotaPercentage, type QuotaMetric } from "@/lib/openstack/quota";
import type {
  ServiceDirectoryId,
  ServiceDirectoryItem,
} from "@/lib/openstack/service-directory";

const quickAccess = [
  { label: "Instances", href: "/compute/instances", icon: Server, tone: "sky" },
  {
    label: "Volumes",
    href: "/compute/volumes",
    icon: HardDrive,
    tone: "emerald",
  },
  { label: "Networks", href: "/compute/networks", icon: Network, tone: "cyan" },
  { label: "Images", href: "/compute/images", icon: ImageIcon, tone: "amber" },
  { label: "Kubernetes", href: "/kubernetes", icon: Container, tone: "rose" },
  {
    label: "Buckets",
    href: "/object-storage/buckets",
    icon: Database,
    tone: "violet",
  },
] as const;

const serviceIcons: Record<
  OverviewService["id"],
  ComponentType<{ className?: string }>
> = {
  compute: Server,
  storage: HardDrive,
  network: Network,
  "shared-file-system": FolderTree,
  "container-infra": Container,
  "load-balancing": Waypoints,
};

const toneClasses = {
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
} as const;

const serviceDirectoryIcons: Record<
  ServiceDirectoryId,
  ComponentType<{ className?: string }>
> = {
  compute: Server,
  kubernetes: Container,
  "object-storage": Database,
  orchestration: Layers,
  dns: Globe2,
  "file-system": FolderTree,
};

function formatValue(value: number, unit?: string) {
  const formatted = new Intl.NumberFormat("en", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function QuotaBar({ metric }: { metric: QuotaMetric }) {
  const percentage = quotaPercentage(metric);
  const limitLabel =
    metric.limit < 0 ? "Unlimited" : formatValue(metric.limit, metric.unit);
  const color = {
    normal: "bg-sky-500 dark:bg-sky-400",
    warning: "bg-amber-500 dark:bg-amber-400",
    critical: "bg-rose-600 dark:bg-rose-400",
    unlimited: "bg-emerald-500 dark:bg-emerald-400",
  }[metric.level];

  return (
    <Link
      href={metric.href}
      className="group block rounded-md px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground">
          {metric.label}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {formatValue(metric.used, metric.unit)}
          <span className="font-normal text-muted-foreground">
            {" "}
            / {limitLabel}
          </span>
        </span>
      </div>
      <div
        className={cn(
          "mt-2 h-1.5 overflow-hidden rounded-full bg-muted",
          metric.level === "unlimited" &&
            "border-y border-dashed border-emerald-500/50 bg-emerald-500/5",
        )}
        role={percentage === null ? undefined : "progressbar"}
        aria-label={`${metric.label} quota usage`}
        aria-valuemin={percentage === null ? undefined : 0}
        aria-valuemax={percentage === null ? undefined : 100}
        aria-valuenow={percentage === null ? undefined : Math.round(percentage)}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", color)}
          style={{ width: `${percentage ?? 0}%` }}
        />
      </div>
      {metric.reserved > 0 ? (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {formatValue(metric.reserved, metric.unit)} reserved
        </div>
      ) : null}
    </Link>
  );
}

function ResourceGroup({ service }: { service: OverviewService }) {
  const Icon = serviceIcons[service.id];

  return (
    <div className="grid gap-4 border-b px-4 py-5 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-sm font-medium">{service.label}</div>
          <div className="text-xs text-muted-foreground">
            {service.status === "available" ? "Current usage" : service.message}
          </div>
        </div>
      </div>
      {service.status === "available" ? (
        <div
          className={cn(
            "grid gap-x-6 gap-y-3",
            service.metrics.length === 1
              ? "grid-cols-1"
              : service.metrics.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3",
          )}
        >
          {service.metrics.slice(0, 3).map((metric) => (
            <div key={metric.id} className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">
                {metric.label}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatValue(metric.used, metric.unit)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Usage unavailable</div>
      )}
      <Link
        href={service.href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        View
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

const operationalIcons: Record<
  OperationalCategory,
  ComponentType<{ className?: string }>
> = {
  quota: Activity,
  resource: CircleAlert,
  operation: TriangleAlert,
  credential: KeyRound,
  service: CircleAlert,
};

function signalTime(signal: OperationalSignal) {
  if (!signal.timestamp) return null;
  const date = new Date(signal.timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const distance = formatDistanceToNow(date, { addSuffix: true });
  return signal.timestampKind === "expires" ? `Expires ${distance}` : distance;
}

function OperationalFeedSection({ feed }: { feed: OperationalFeed }) {
  const visibleSignals = feed.signals.slice(0, 8);
  const hiddenSignals = feed.signals.length - visibleSignals.length;
  const availableSources = feed.sources.filter(
    (source) => source.status === "available",
  ).length;
  const unavailableSources = feed.sources.filter(
    (source) => source.status !== "available",
  );

  return (
    <section aria-labelledby="attention-heading" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="attention-heading" className="text-sm font-semibold">
            Needs attention
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quota pressure, resource health, failed operations, and credentials
          </p>
        </div>
        <Badge variant="outline" className="w-fit font-normal">
          {availableSources} of {feed.sources.length} resource checks available
        </Badge>
      </div>

      <div className="border-y">
        {visibleSignals.length > 0 ? (
          <div className="divide-y">
            {visibleSignals.map((signal) => {
              const Icon = operationalIcons[signal.category];
              const time = signalTime(signal);
              return (
                <Link
                  key={signal.id}
                  href={signal.href}
                  className="group grid gap-3 px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md",
                      signal.severity === "critical"
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium group-hover:underline">
                        {signal.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {signal.service}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {signal.detail}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 pl-12 text-xs text-muted-foreground sm:pl-0">
                    {time ? <span className="whitespace-nowrap">{time}</span> : null}
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex items-start gap-3 px-2 py-5">
            <span className="flex size-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <div className="text-sm font-medium">
                {unavailableSources.length > 0
                  ? "No issues detected in available checks"
                  : "No issues detected"}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {unavailableSources.length > 0
                  ? "Completed quota and resource checks have not reported anything requiring action."
                  : "Current quota and resource checks have not reported anything requiring action."}
              </p>
            </div>
          </div>
        )}
      </div>

      {hiddenSignals > 0 || unavailableSources.length > 0 ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          {unavailableSources.length > 0 ? (
            <span>
              Checks unavailable: {unavailableSources.map((source) => source.label).join(", ")}
            </span>
          ) : (
            <span />
          )}
          {hiddenSignals > 0 ? (
            <span>
              {hiddenSignals} more {hiddenSignals === 1 ? "issue" : "issues"} available in service views
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OverviewDashboard({
  services,
  operationalFeed,
  serviceDirectory,
}: {
  services: OverviewService[];
  operationalFeed: OperationalFeed;
  serviceDirectory: ServiceDirectoryItem[];
}) {
  const unavailable = services.filter(
    (service) => service.status !== "available",
  );
  const availableDirectoryServices = serviceDirectory.filter(
    (service) => service.status === "available",
  ).length;
  const directoryStatusUnknown = serviceDirectory.some(
    (service) => service.status === "unknown",
  );

  return (
    <div className="space-y-10">
      <section aria-labelledby="quick-access-heading" className="space-y-3">
        <h2 id="quick-access-heading" className="text-sm font-semibold">
          Quick access
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {quickAccess.map(({ label, href, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group flex h-16 items-center gap-3 rounded-md border bg-background px-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-md",
                  toneClasses[tone],
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{label}</span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      <OperationalFeedSection feed={operationalFeed} />

      <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section
          aria-labelledby="resources-heading"
          className="min-w-0 space-y-3"
        >
          <div>
            <h2 id="resources-heading" className="text-sm font-semibold">
              Resource overview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Usage reported by OpenStack services
            </p>
          </div>
          <div className="overflow-hidden rounded-md border bg-card/30">
            {services.map((service) => (
              <ResourceGroup key={service.id} service={service} />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="capacity-heading"
          className="min-w-0 space-y-3"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="capacity-heading" className="text-sm font-semibold">
                Capacity
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Project quota consumption
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unavailable.length > 0 ? (
                <Badge variant="outline">
                  {unavailable.length} unavailable
                </Badge>
              ) : null}
              <Link
                href="/quotas"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                View all quotas
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="min-w-0 rounded-md border bg-card/30 p-3"
              >
                <div className="flex h-8 items-center justify-between px-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    {service.label}
                  </h3>
                  {service.status !== "available" ? (
                    <CircleAlert className="size-4 text-muted-foreground" />
                  ) : null}
                </div>
                {service.status === "available" ? (
                  <div>
                    {service.metrics.slice(0, 3).map((metric) => (
                      <QuotaBar key={metric.id} metric={metric} />
                    ))}
                    {service.metrics.length > 3 ? (
                      <Link
                        href="/quotas"
                        className="mx-2 mt-1 inline-flex text-xs text-muted-foreground hover:text-foreground"
                      >
                        {service.metrics.length - 3} more quotas
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <div className="px-2 py-4 text-sm text-muted-foreground">
                    {service.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="services-heading" className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="services-heading" className="text-sm font-semibold">
            Services
          </h2>
          <Badge variant="outline" className="font-normal">
            {directoryStatusUnknown
              ? "Catalog status unknown"
              : `${availableDirectoryServices} of ${serviceDirectory.length} available`}
          </Badge>
        </div>
        <div className="grid border-y sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {serviceDirectory.map((service, index) => {
            const Icon = serviceDirectoryIcons[service.id];
            const className = cn(
              "flex items-center gap-3 border-b px-3 py-4 text-sm transition-colors hover:bg-muted/50 sm:border-r",
              index >= serviceDirectory.length - 2 && "sm:border-b-0",
              index % 2 === 1 && "sm:border-r-0",
              index >= 3 ? "lg:border-b-0" : "lg:border-b",
              index % 3 === 2 ? "lg:border-r-0" : "lg:border-r",
              "xl:border-b-0 xl:border-r",
              index === serviceDirectory.length - 1 && "xl:border-r-0",
              service.status === "unavailable" &&
                "cursor-not-allowed bg-muted/20 text-muted-foreground hover:bg-muted/20",
            );
            const content = (
              <>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {service.label}
                </span>
                {service.status === "available" ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {service.status === "unavailable"
                      ? "Unavailable"
                      : "Unknown"}
                  </Badge>
                )}
              </>
            );

            return service.status === "unavailable" ? (
              <div
                key={service.id}
                aria-disabled="true"
                title={service.message}
                className={className}
              >
                {content}
              </div>
            ) : (
              <Link
                key={service.id}
                href={service.href}
                title={service.message}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
