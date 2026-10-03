import { AlertTriangle, Gauge, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { QuotaImpact } from "@/lib/openstack/quota-impact";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function quantity(value: number, unit?: string) {
  return `${numberFormatter.format(value)}${unit ? ` ${unit}` : ""}`;
}

function quotaWidths(impact: QuotaImpact) {
  if (impact.metric.limit <= 0) {
    return { used: 0, reserved: 0, requested: 0 };
  }

  const percentage = (value: number) =>
    Math.min(100, Math.max(0, (value / impact.metric.limit) * 100));
  return {
    used: percentage(impact.kind === "per-resource" ? 0 : impact.metric.used),
    reserved: percentage(
      impact.kind === "per-resource" ? 0 : impact.metric.reserved,
    ),
    requested: percentage(impact.requested),
  };
}

export function QuotaImpactPreview({
  impacts,
  loading = false,
  unavailableMessage,
  title = "Quota impact",
  description = "Projected usage includes resources already reserved by operations in progress.",
}: {
  impacts: QuotaImpact[];
  loading?: boolean;
  unavailableMessage?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section className="space-y-3 border-y py-4" aria-label="Quota impact">
      <div className="flex items-start gap-3">
        <Gauge
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading current project quotas
        </div>
      ) : unavailableMessage ? (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{unavailableMessage}</span>
        </div>
      ) : impacts.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {impacts.map((impact) => {
            const widths = quotaWidths(impact);
            const unit = impact.metric.unit;
            return (
              <div
                key={impact.metric.id}
                className={cn(
                  "min-w-0 rounded-md border px-3 py-2.5",
                  impact.exceeds &&
                    "border-status-danger-border bg-status-danger-soft",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-medium leading-snug">
                    {impact.metric.label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium tabular-nums text-muted-foreground",
                      impact.exceeds && "text-status-danger",
                    )}
                  >
                    +{quantity(impact.requested, unit)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {impact.kind === "per-resource" ? "Requested" : "Projected"}{" "}
                    {quantity(impact.projected, unit)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {impact.metric.limit < 0
                      ? "Unlimited"
                      : `${quantity(impact.metric.limit, unit)} limit`}
                  </span>
                </div>
                {impact.metric.limit >= 0 ? (
                  <div
                    className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${impact.metric.label} projected quota usage`}
                    aria-valuemin={0}
                    aria-valuemax={impact.metric.limit}
                    aria-valuenow={Math.min(
                      impact.metric.limit,
                      impact.projected,
                    )}
                  >
                    <span
                      className="h-full shrink-0 bg-status-info"
                      style={{ width: `${widths.used}%` }}
                    />
                    <span
                      className="h-full shrink-0 bg-status-warning"
                      style={{ width: `${widths.reserved}%` }}
                    />
                    <span
                      className={cn(
                        "h-full shrink-0 bg-primary",
                        impact.exceeds && "bg-status-danger",
                      )}
                      style={{ width: `${widths.requested}%` }}
                    />
                  </div>
                ) : null}
                {impact.kind === "consumable" && impact.metric.reserved > 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {quantity(impact.metric.used, unit)} used,{" "}
                    {quantity(impact.metric.reserved, unit)} reserved
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Complete the resource settings to calculate quota impact.
        </p>
      )}
    </section>
  );
}
