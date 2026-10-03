import type { Flavor } from "@/types/openstack";
import type { QuotaMetric } from "@/lib/openstack/quota";

export type QuotaImpactKind = "consumable" | "per-resource";

export type QuotaImpact = {
  metric: QuotaMetric;
  requested: number;
  consumed: number;
  projected: number;
  remaining: number | null;
  exceeds: boolean;
  kind: QuotaImpactKind;
};

export type QuotaRequest = {
  metricId: string;
  requested: number;
  kind?: QuotaImpactKind;
};

function validRequested(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildQuotaImpact(
  metric: QuotaMetric,
  requested: number,
  kind: QuotaImpactKind = "consumable",
): QuotaImpact {
  const normalizedRequest = validRequested(requested);
  const consumed = kind === "per-resource" ? 0 : metric.used + metric.reserved;
  const projected = consumed + normalizedRequest;
  const remaining =
    metric.limit < 0 ? null : Math.max(0, metric.limit - consumed);

  return {
    metric,
    requested: normalizedRequest,
    consumed,
    projected,
    remaining,
    exceeds: metric.limit >= 0 && projected > metric.limit,
    kind,
  };
}

function metricById(metrics: QuotaMetric[], id: string) {
  return metrics.find((metric) => metric.id === id);
}

export function quotaRequestImpacts(
  metrics: QuotaMetric[],
  requests: QuotaRequest[],
) {
  return requests.flatMap(({ metricId, requested, kind }) => {
    const metric = metricById(metrics, metricId);
    return metric ? [buildQuotaImpact(metric, requested, kind)] : [];
  });
}

export function novaQuotaImpacts(
  metrics: QuotaMetric[],
  flavor: Flavor | undefined,
  count: number,
  metadataItems = 0,
) {
  const normalizedCount = Number.isInteger(count) && count > 0 ? count : 0;
  const impacts: QuotaImpact[] = [];
  const instances = metricById(metrics, "instances");
  if (instances) {
    impacts.push(buildQuotaImpact(instances, normalizedCount));
  }

  if (!flavor) return impacts;

  const cores = metricById(metrics, "cores");
  if (cores) {
    impacts.push(
      buildQuotaImpact(cores, normalizedCount * Math.max(0, flavor.vcpus)),
    );
  }
  const ram = metricById(metrics, "ram");
  if (ram) {
    impacts.push(
      buildQuotaImpact(ram, normalizedCount * (Math.max(0, flavor.ram) / 1024)),
    );
  }

  const metadata = metricById(metrics, "metadata_items");
  if (metadata && metadataItems > 0) {
    impacts.push(buildQuotaImpact(metadata, metadataItems, "per-resource"));
  }

  return impacts;
}

export function novaResizeQuotaImpacts(
  metrics: QuotaMetric[],
  currentFlavor: Pick<Flavor, "ram" | "vcpus"> | undefined,
  targetFlavor: Pick<Flavor, "ram" | "vcpus"> | undefined,
) {
  if (!currentFlavor || !targetFlavor) return [];

  return quotaRequestImpacts(metrics, [
    {
      metricId: "cores",
      requested: Math.max(0, targetFlavor.vcpus - currentFlavor.vcpus),
    },
    {
      metricId: "ram",
      requested: Math.max(0, targetFlavor.ram - currentFlavor.ram) / 1024,
    },
  ]);
}

export function cinderVolumeQuotaImpacts(
  metrics: QuotaMetric[],
  sizeGiB: number,
  volumeTypeName?: string,
  count = 1,
) {
  const normalizedSize = Number.isInteger(sizeGiB) && sizeGiB > 0 ? sizeGiB : 0;
  const normalizedCount = Number.isInteger(count) && count > 0 ? count : 0;
  const impacts: QuotaImpact[] = [];
  const volumes = metricById(metrics, "volumes");
  const gigabytes = metricById(metrics, "gigabytes");
  const perVolume = metricById(metrics, "per_volume_gigabytes");

  if (volumes) impacts.push(buildQuotaImpact(volumes, normalizedCount));
  if (gigabytes) {
    impacts.push(buildQuotaImpact(gigabytes, normalizedSize * normalizedCount));
  }
  if (perVolume) {
    impacts.push(buildQuotaImpact(perVolume, normalizedSize, "per-resource"));
  }

  if (volumeTypeName) {
    const typeVolumes = metricById(metrics, `volumes_${volumeTypeName}`);
    const typeGigabytes = metricById(metrics, `gigabytes_${volumeTypeName}`);
    if (typeVolumes) {
      impacts.push(buildQuotaImpact(typeVolumes, normalizedCount));
    }
    if (typeGigabytes) {
      impacts.push(
        buildQuotaImpact(typeGigabytes, normalizedSize * normalizedCount),
      );
    }
  }

  return impacts;
}

export function cinderSnapshotQuotaImpacts(
  metrics: QuotaMetric[],
  volumeTypeName?: string,
) {
  const requests: QuotaRequest[] = [{ metricId: "snapshots", requested: 1 }];

  if (volumeTypeName) {
    requests.push({ metricId: `snapshots_${volumeTypeName}`, requested: 1 });
  }

  return quotaRequestImpacts(metrics, requests);
}

export function quotaImpactIssues(impacts: QuotaImpact[]) {
  return impacts
    .filter(({ exceeds, requested }) => exceeds && requested > 0)
    .map(({ metric, requested, remaining, kind }) => {
      if (kind === "per-resource") {
        return `Requested size exceeds the ${metric.label.toLowerCase()} of ${metric.limit} ${metric.unit ?? "units"}.`;
      }
      const unit = metric.unit ? ` ${metric.unit}` : "";
      return `${metric.label} quota is insufficient: ${remaining ?? 0}${unit} remaining, ${requested}${unit} required.`;
    });
}

export function quotaUnavailableReason(impacts: QuotaImpact[]) {
  const exceeded = impacts.filter(({ exceeds }) => exceeds);
  if (!exceeded.length) return null;
  return exceeded.map(({ metric }) => metric.label).join(" and ");
}
