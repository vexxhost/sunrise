import { DetailSection } from "@/components/Instance/DetailFields";
import type { OctaviaTrafficStats } from "@/types/openstack";

const integerFormat = new Intl.NumberFormat("en-US");

function formatBytes(value: number | undefined) {
  if (value === undefined) return "Not reported";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const exponent = Math.min(
    Math.floor(Math.log2(value) / 10),
    units.length - 1,
  );
  return `${(value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatCount(value: number | undefined) {
  return value === undefined ? "Not reported" : integerFormat.format(value);
}

export function TrafficStatistics({
  stats,
}: {
  stats: OctaviaTrafficStats | null;
}) {
  return (
    <DetailSection title="Traffic statistics">
      {stats ? (
        <dl className="grid gap-x-4 gap-y-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Active connections", formatCount(stats.active_connections)],
            ["Total connections", formatCount(stats.total_connections)],
            ["Request errors", formatCount(stats.request_errors)],
            ["Bytes in", formatBytes(stats.bytes_in)],
            ["Bytes out", formatBytes(stats.bytes_out)],
          ].map(([label, value]) => (
            <div className="min-w-0" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 wrap-anywhere text-sm font-medium tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          Traffic statistics are unavailable.
        </p>
      )}
    </DetailSection>
  );
}
