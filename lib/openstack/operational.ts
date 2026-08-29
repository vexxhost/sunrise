import type { OverviewService } from "@/lib/openstack/overview";
import { quotaPercentage } from "@/lib/openstack/quota";

export type OperationalSeverity = "critical" | "warning";
export type OperationalCategory =
  | "quota"
  | "resource"
  | "operation"
  | "credential"
  | "service";

export type OperationalSignal = {
  id: string;
  severity: OperationalSeverity;
  category: OperationalCategory;
  service: string;
  title: string;
  detail: string;
  href: string;
  timestamp?: string;
  timestampKind?: "occurred" | "expires";
};

export type OperationalSourceStatus =
  | "available"
  | "forbidden"
  | "unavailable"
  | "error";

export type OperationalSource = {
  id: string;
  label: string;
  href: string;
  status: OperationalSourceStatus;
  message?: string;
};

export type OperationalFeed = {
  signals: OperationalSignal[];
  sources: OperationalSource[];
};

const severityRank: Record<OperationalSeverity, number> = {
  critical: 0,
  warning: 1,
};

export const S3_CREDENTIAL_WARNING_MS = 15 * 60 * 1000;

function quotaSignals(services: OverviewService[]): OperationalSignal[] {
  return services.flatMap((service) =>
    service.metrics.flatMap((metric) => {
      if (metric.level !== "warning" && metric.level !== "critical") {
        return [];
      }

      const percentage = Math.round(quotaPercentage(metric) ?? 0);
      return [
        {
          id: `quota:${service.id}:${metric.id}`,
          severity: metric.level,
          category: "quota",
          service: service.label,
          title: `${metric.label} quota is at ${percentage}%`,
          detail: `${service.label} effective usage is approaching its project limit.`,
          href: metric.href,
        } satisfies OperationalSignal,
      ];
    }),
  );
}

function serviceSignals(services: OverviewService[]): OperationalSignal[] {
  return services.flatMap((service) =>
    service.status === "error"
      ? [
          {
            id: `service:${service.id}`,
            severity: "warning",
            category: "service",
            service: service.label,
            title: `${service.label} quota check failed`,
            detail: service.message ?? "Quota data could not be refreshed.",
            href: service.href,
          } satisfies OperationalSignal,
        ]
      : [],
  );
}

function sourceSignals(sources: OperationalSource[]): OperationalSignal[] {
  return sources.flatMap((source) =>
    source.status === "error"
      ? [
          {
            id: `monitor:${source.id}`,
            severity: "warning",
            category: "service",
            service: source.label,
            title: `${source.label} health check failed`,
            detail: source.message ?? "Resource health could not be refreshed.",
            href: source.href,
          } satisfies OperationalSignal,
        ]
      : [],
  );
}

function credentialSignals(
  credentialExpiration: number | undefined,
  now: number,
): OperationalSignal[] {
  if (
    credentialExpiration === undefined ||
    credentialExpiration - now > S3_CREDENTIAL_WARNING_MS
  ) {
    return [];
  }

  const expired = credentialExpiration <= now;
  const minutes = Math.max(
    1,
    Math.ceil((credentialExpiration - now) / 60_000),
  );

  return [
    {
      id: "credential:object-storage",
      severity: expired ? "critical" : "warning",
      category: "credential",
      service: "Object storage",
      title: expired
        ? "Object storage credentials expired"
        : "Object storage credentials expire soon",
      detail: expired
        ? "Open Object Storage to renew credentials for this project."
        : `Temporary credentials expire in about ${minutes} minutes.`,
      href: "/object-storage",
      timestamp: new Date(credentialExpiration).toISOString(),
      timestampKind: "expires",
    },
  ];
}

export function compileOperationalFeed({
  services,
  resourceFeed,
  credentialExpiration,
  now = Date.now(),
}: {
  services: OverviewService[];
  resourceFeed: OperationalFeed;
  credentialExpiration?: number;
  now?: number;
}): OperationalFeed {
  const signals = [
    ...resourceFeed.signals,
    ...quotaSignals(services),
    ...serviceSignals(services),
    ...sourceSignals(resourceFeed.sources),
    ...credentialSignals(credentialExpiration, now),
  ].sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;

    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.title.localeCompare(right.title);
  });

  return { signals, sources: resourceFeed.sources };
}
