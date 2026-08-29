import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight,
  Container,
  Database,
  HardDrive,
  ImageIcon,
  Server,
} from "lucide-react";
import { ProjectContextHeader } from "@/components/overview/ProjectContextHeader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resourceKindLabel,
  resourcePreferenceHref,
  type ResourceKind,
  type ResourcePreference,
} from "@/lib/resource-preferences";

type LandingIcon = ComponentType<{ className?: string }>;

export type ServiceLandingMetric = {
  label: string;
  value: string;
  detail: string;
  icon: LandingIcon;
  utilization?: {
    percentage: number;
    level: "normal" | "warning" | "critical";
  };
};

export type ServiceLandingResource = {
  name: string;
  description: string;
  icon: LandingIcon;
  href?: string;
  meta?: string;
  badge?: string;
};

const recentResourceIcons: Record<ResourceKind, LandingIcon> = {
  instance: Server,
  volume: HardDrive,
  image: ImageIcon,
  cluster: Container,
  bucket: Database,
};

export function ServiceLandingPage({
  title,
  description,
  projectName,
  regionName,
  actions,
  metrics,
  children,
}: {
  title: string;
  description: string;
  projectName: string;
  regionName: string;
  actions?: ReactNode;
  metrics: ServiceLandingMetric[];
  children: ReactNode;
}) {
  return (
    <div className="max-w-screen-xl space-y-8">
      <ProjectContextHeader
        title={title}
        description={description}
        projectName={projectName}
        regionName={regionName}
        actions={actions}
      />

      <section
        aria-label={`${title} summary`}
        className={cn(
          "grid gap-px overflow-hidden rounded-md border bg-border",
          metrics.length === 3
            ? "md:grid-cols-3"
            : "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const utilizationColor = metric.utilization
            ? {
                normal: "bg-sky-500 dark:bg-sky-400",
                warning: "bg-amber-500 dark:bg-amber-400",
                critical: "bg-rose-600 dark:bg-rose-400",
              }[metric.utilization.level]
            : null;
          return (
            <div key={metric.label} className="min-w-0 bg-background p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{metric.label}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">
                {metric.value}
              </div>
              <p
                className="mt-1 truncate text-xs text-muted-foreground"
                title={metric.detail}
              >
                {metric.detail}
              </p>
              {metric.utilization ? (
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${metric.label} quota utilization`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(metric.utilization.percentage)}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      utilizationColor,
                    )}
                    style={{ width: `${metric.utilization.percentage}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {children}
    </div>
  );
}

export function ServiceLandingSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ServiceResourceGrid({
  resources,
}: {
  resources: ServiceLandingResource[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {resources.map((resource) => {
        const Icon = resource.icon;
        const content = (
          <>
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{resource.name}</span>
                  {resource.badge ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-muted-foreground"
                    >
                      {resource.badge}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {resource.description}
                </span>
              </span>
              {resource.href ? (
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            {resource.meta ? (
              <span className="mt-4 block text-xs text-muted-foreground">
                {resource.meta}
              </span>
            ) : null}
          </>
        );

        return resource.href ? (
          <Link
            key={resource.name}
            href={resource.href}
            className="group min-h-28 rounded-md border p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </Link>
        ) : (
          <div
            key={resource.name}
            className="min-h-28 rounded-md border border-dashed p-4 opacity-70"
            aria-disabled="true"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function ServiceRecentResources({
  resources,
  kinds,
  emptyMessage,
}: {
  resources: ResourcePreference[];
  kinds: ResourceKind[];
  emptyMessage: string;
}) {
  const allowedKinds = new Set(kinds);
  const visibleResources = resources
    .filter((resource) => allowedKinds.has(resource.kind))
    .slice(0, 5);

  return (
    <ServiceLandingSection
      title="Your resources"
      description="Pinned and recently viewed resources in this project and region."
    >
      <div className="overflow-hidden rounded-md border">
        {visibleResources.length ? (
          <ul className="divide-y">
            {visibleResources.map((resource) => {
              const Icon = recentResourceIcons[resource.kind];
              return (
                <li key={`${resource.kind}:${resource.id}`}>
                  <Link
                    href={resourcePreferenceHref(resource)}
                    className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {resource.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {resourceKindLabel(resource.kind)}
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>
    </ServiceLandingSection>
  );
}
