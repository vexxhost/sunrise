import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  ChevronRight,
  CircleAlert,
  Container,
  Database,
  FolderTree,
  Globe2,
  HardDrive,
  ImageIcon,
  Layers,
  Network,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OverviewService } from '@/lib/openstack/overview';
import {
  quotaPercentage,
  type QuotaMetric,
} from '@/lib/openstack/quota';

const quickAccess = [
  { label: 'Instances', href: '/compute/instances', icon: Server, tone: 'sky' },
  { label: 'Volumes', href: '/compute/volumes', icon: HardDrive, tone: 'emerald' },
  { label: 'Networks', href: '/compute/networks', icon: Network, tone: 'cyan' },
  { label: 'Images', href: '/compute/images', icon: ImageIcon, tone: 'amber' },
  { label: 'Kubernetes', href: '/kubernetes', icon: Container, tone: 'rose' },
  { label: 'Buckets', href: '/object-storage/buckets', icon: Database, tone: 'violet' },
] as const;

const serviceIcons: Record<OverviewService['id'], ComponentType<{ className?: string }>> = {
  compute: Server,
  storage: HardDrive,
  network: Network,
};

const toneClasses = {
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
} as const;

const serviceDirectory = [
  { label: 'Compute', href: '/compute/instances', icon: Server },
  { label: 'Kubernetes', href: '/kubernetes', icon: Container },
  { label: 'Object Storage', href: '/object-storage', icon: Database },
  { label: 'Orchestration', href: '/orchestration', icon: Layers },
  { label: 'DNS', href: '/dns', icon: Globe2 },
  { label: 'File System', href: '/file-system', icon: FolderTree },
];

function formatValue(value: number, unit?: string) {
  const formatted = new Intl.NumberFormat('en', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function QuotaBar({ metric }: { metric: QuotaMetric }) {
  const percentage = quotaPercentage(metric);
  const limitLabel =
    metric.limit < 0 ? 'Unlimited' : formatValue(metric.limit, metric.unit);
  const color = {
    normal: 'bg-sky-500 dark:bg-sky-400',
    warning: 'bg-amber-500 dark:bg-amber-400',
    critical: 'bg-rose-600 dark:bg-rose-400',
    unlimited: 'bg-emerald-500 dark:bg-emerald-400',
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
          <span className="font-normal text-muted-foreground"> / {limitLabel}</span>
        </span>
      </div>
      <div
        className={cn(
          'mt-2 h-1.5 overflow-hidden rounded-full bg-muted',
          metric.level === 'unlimited' &&
            'border-y border-dashed border-emerald-500/50 bg-emerald-500/5'
        )}
        role={percentage === null ? undefined : 'progressbar'}
        aria-label={`${metric.label} quota usage`}
        aria-valuemin={percentage === null ? undefined : 0}
        aria-valuemax={percentage === null ? undefined : 100}
        aria-valuenow={percentage === null ? undefined : Math.round(percentage)}
      >
        <div
          className={cn('h-full rounded-full transition-[width]', color)}
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
            {service.status === 'available' ? 'Current usage' : service.message}
          </div>
        </div>
      </div>
      {service.status === 'available' ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {service.metrics.slice(0, 3).map((metric) => (
            <div key={metric.id} className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">{metric.label}</div>
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

export function OverviewDashboard({ services }: { services: OverviewService[] }) {
  const warningMetrics = services.flatMap((service) =>
    service.metrics
      .filter((metric) => metric.level === 'warning' || metric.level === 'critical')
      .map((metric) => ({ service: service.label, metric }))
  );
  const unavailable = services.filter((service) => service.status !== 'available');

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
              <span className={cn('flex size-9 items-center justify-center rounded-md', toneClasses[tone])}>
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{label}</span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      {warningMetrics.length > 0 ? (
        <section
          aria-labelledby="attention-heading"
          className="border-y border-amber-500/30 bg-amber-500/5 py-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <h2 id="attention-heading" className="text-sm font-semibold">
                Needs attention
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {warningMetrics.map(({ service, metric }) => (
                  <Badge
                    key={`${service}-${metric.id}`}
                    variant="outline"
                    className="border-amber-500/30 bg-background/60"
                  >
                    {service}: {metric.label} {Math.round(quotaPercentage(metric) ?? 0)}%
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="resources-heading" className="min-w-0 space-y-3">
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

        <section aria-labelledby="capacity-heading" className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="capacity-heading" className="text-sm font-semibold">
                Capacity
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Project quota consumption
              </p>
            </div>
            {unavailable.length > 0 ? (
              <Badge variant="outline">{unavailable.length} unavailable</Badge>
            ) : null}
          </div>
          <div className="grid overflow-hidden rounded-md border bg-card/30 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            {services.map((service, index) => (
              <div
                key={service.id}
                className={cn(
                  'min-w-0 p-3',
                  index > 0 && 'border-t lg:border-l lg:border-t-0 xl:border-l-0 xl:border-t 2xl:border-l 2xl:border-t-0'
                )}
              >
                <div className="flex h-8 items-center justify-between px-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    {service.label}
                  </h3>
                  {service.status !== 'available' ? (
                    <CircleAlert className="size-4 text-muted-foreground" />
                  ) : null}
                </div>
                {service.status === 'available' ? (
                  <div>
                    {service.metrics.map((metric) => (
                      <QuotaBar key={metric.id} metric={metric} />
                    ))}
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
        <h2 id="services-heading" className="text-sm font-semibold">
          Services
        </h2>
        <div className="grid border-y sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {serviceDirectory.map(({ label, href, icon: Icon }, index) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 border-b px-3 py-4 text-sm transition-colors hover:bg-muted/50 sm:border-r',
                index >= serviceDirectory.length - 2 && 'sm:border-b-0',
                index % 2 === 1 && 'sm:border-r-0',
                index >= 3 ? 'lg:border-b-0' : 'lg:border-b',
                index % 3 === 2 ? 'lg:border-r-0' : 'lg:border-r',
                'xl:border-b-0 xl:border-r',
                index === serviceDirectory.length - 1 && 'xl:border-r-0'
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
