"use client";

import { Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  formatIpCount,
  ipCapacity,
  ipUsagePercentage,
} from "@/lib/openstack/neutron-ip-availability";
import type { NetworkIpAvailabilityResult } from "@/lib/openstack/neutron-ip-availability-actions";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";

function CapacityValue({ value }: { value: number }) {
  return <span className="font-mono text-sm">{formatIpCount(value)}</span>;
}

function UtilizationBar({ total, used }: { total: number; used: number }) {
  const percentage = ipUsagePercentage({
    available: Math.max(total - used, 0),
    total,
    used,
    usageExceedsCapacity: used > total,
  });
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="Allocated IP address percentage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percentage)}
    >
      <div
        className="h-full bg-primary transition-[width]"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export function NetworkIpAvailabilitySection({
  result,
  support,
}: {
  result: NetworkIpAvailabilityResult;
  support: OpenStackFeatureSupport;
}) {
  if (result.status === "restricted") {
    const confirmed = support.status === "supported";
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">IP capacity</h3>
          <Badge variant="outline">
            {confirmed ? "Policy restricted" : "Unavailable"}
          </Badge>
        </div>
        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          {confirmed
            ? "IP availability is not exposed to the active OpenStack role."
            : "IP availability could not be confirmed for this cloud or active OpenStack role."}
        </div>
      </section>
    );
  }

  const { availability } = result;
  const networkCapacity = ipCapacity(availability);
  const networkPercentage = ipUsagePercentage(networkCapacity);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">IP capacity</h3>
        <Badge variant="outline">
          {networkPercentage.toLocaleString("en-US", {
            maximumFractionDigits: 1,
          })}
          % allocated
        </Badge>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Pool capacity</p>
            <CapacityValue value={networkCapacity.total} />
          </div>
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Allocated</p>
            <CapacityValue value={networkCapacity.used} />
          </div>
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Available</p>
            <CapacityValue value={networkCapacity.available} />
          </div>
        </div>
        <div className="border-t px-3 py-2.5">
          <UtilizationBar
            total={networkCapacity.total}
            used={networkCapacity.used}
          />
          {networkCapacity.usageExceedsCapacity ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Some allocated addresses are outside the reported allocation
              pools.
            </p>
          ) : null}
        </div>
      </div>

      {availability.subnet_ip_availability.length ? (
        <div className="overflow-x-auto rounded-md border">
          <div className="grid min-w-[58rem] grid-cols-[minmax(10rem,1fr)_minmax(10rem,1.2fr)_6rem_8rem_8rem_8rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Subnet</span>
            <span>CIDR</span>
            <span>Version</span>
            <span>Capacity</span>
            <span>Allocated</span>
            <span>Available</span>
          </div>
          {availability.subnet_ip_availability.map((subnet) => {
            const capacity = ipCapacity(subnet);
            return (
              <div
                key={subnet.subnet_id}
                className="grid min-w-[58rem] grid-cols-[minmax(10rem,1fr)_minmax(10rem,1.2fr)_6rem_8rem_8rem_8rem] items-center px-3 py-2 text-sm not-last:border-b"
              >
                <span className="truncate" title={subnet.subnet_name}>
                  {subnet.subnet_name || subnet.subnet_id}
                </span>
                <span className="font-mono text-xs">{subnet.cidr}</span>
                <span>IPv{subnet.ip_version}</span>
                <CapacityValue value={capacity.total} />
                <CapacityValue value={capacity.used} />
                <CapacityValue value={capacity.available} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No subnet capacity data was reported.
        </div>
      )}
    </section>
  );
}
