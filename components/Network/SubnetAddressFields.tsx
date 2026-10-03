"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AllocationPool, HostRoute } from "@/types/openstack";

interface SubnetAddressFieldsProps {
  allocationPools: AllocationPool[];
  disabled: boolean;
  dnsNameservers: string[];
  hostRoutes: HostRoute[];
  idPrefix: string;
  ipVersion: 4 | 6;
  onAllocationPoolsChange: (pools: AllocationPool[]) => void;
  onDnsNameserversChange: (servers: string[]) => void;
  onHostRoutesChange: (routes: HostRoute[]) => void;
}

export function SubnetAddressFields({
  allocationPools,
  disabled,
  dnsNameservers,
  hostRoutes,
  idPrefix,
  ipVersion,
  onAllocationPoolsChange,
  onDnsNameserversChange,
  onHostRoutesChange,
}: SubnetAddressFieldsProps) {
  const updatePool = (
    index: number,
    field: keyof AllocationPool,
    value: string,
  ) => {
    onAllocationPoolsChange(
      allocationPools.map((pool, poolIndex) =>
        poolIndex === index ? { ...pool, [field]: value } : pool,
      ),
    );
  };
  const updateRoute = (
    index: number,
    field: keyof HostRoute,
    value: string,
  ) => {
    onHostRoutesChange(
      hostRoutes.map((route, routeIndex) =>
        routeIndex === index ? { ...route, [field]: value } : route,
      ),
    );
  };
  const addressPlaceholder = ipVersion === 6 ? "2001:db8::10" : "10.0.0.10";
  const poolEndPlaceholder =
    ipVersion === 6 ? "2001:db8::ffff" : "10.0.0.250";
  const dnsPlaceholder = ipVersion === 6 ? "2606:4700:4700::1111" : "1.1.1.1";
  const routeDestinationPlaceholder = ipVersion === 6 ? "::/0" : "0.0.0.0/0";
  const routeNextHopPlaceholder =
    ipVersion === 6 ? "2001:db8::1" : "10.0.0.1";

  return (
    <div className="space-y-5 sm:col-span-2">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Label>DHCP allocation pools</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Address ranges Neutron may assign to ports and DHCP clients. Leave
              empty to use the subnet&apos;s automatic range.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onAllocationPoolsChange([
                ...allocationPools,
                { start: "", end: "" },
              ])
            }
          >
            <Plus className="size-4" />
            Add range
          </Button>
        </div>
        {allocationPools.length ? (
          <div className="space-y-2">
            {allocationPools.map((pool, index) => (
              <div
                key={`${idPrefix}-pool-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-pool-start-${index}`}>
                    Start address
                  </Label>
                  <Input
                    id={`${idPrefix}-pool-start-${index}`}
                    required
                    placeholder={addressPlaceholder}
                    value={pool.start}
                    disabled={disabled}
                    onChange={(event) =>
                      updatePool(index, "start", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-pool-end-${index}`}>
                    End address
                  </Label>
                  <Input
                    id={`${idPrefix}-pool-end-${index}`}
                    required
                    placeholder={poolEndPlaceholder}
                    value={pool.end}
                    disabled={disabled}
                    onChange={(event) =>
                      updatePool(index, "end", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove allocation range ${index + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onAllocationPoolsChange(
                      allocationPools.filter(
                        (_, poolIndex) => poolIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Label>DNS servers</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Resolver addresses advertised to workloads on this subnet.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onDnsNameserversChange([...dnsNameservers, ""])}
          >
            <Plus className="size-4" />
            Add DNS server
          </Button>
        </div>
        {dnsNameservers.length ? (
          <div className="space-y-2">
            {dnsNameservers.map((server, index) => (
              <div
                key={`${idPrefix}-dns-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_2rem] items-end gap-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-dns-server-${index}`}>
                    DNS server {index + 1}
                  </Label>
                  <Input
                    id={`${idPrefix}-dns-server-${index}`}
                    required
                    placeholder={dnsPlaceholder}
                    value={server}
                    disabled={disabled}
                    onChange={(event) =>
                      onDnsNameserversChange(
                        dnsNameservers.map((current, serverIndex) =>
                          serverIndex === index ? event.target.value : current,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove DNS server ${index + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onDnsNameserversChange(
                      dnsNameservers.filter(
                        (_, serverIndex) => serverIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Label>Host routes</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Routes advertised to workloads, with a destination CIDR and
              next-hop address.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onHostRoutesChange([
                ...hostRoutes,
                { destination: "", nexthop: "" },
              ])
            }
          >
            <Plus className="size-4" />
            Add route
          </Button>
        </div>
        {hostRoutes.length ? (
          <div className="space-y-2">
            {hostRoutes.map((route, index) => (
              <div
                key={`${idPrefix}-route-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-route-destination-${index}`}>
                    Destination CIDR
                  </Label>
                  <Input
                    id={`${idPrefix}-route-destination-${index}`}
                    required
                    placeholder={routeDestinationPlaceholder}
                    value={route.destination}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRoute(index, "destination", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-route-nexthop-${index}`}>
                    Next hop
                  </Label>
                  <Input
                    id={`${idPrefix}-route-nexthop-${index}`}
                    required
                    placeholder={routeNextHopPlaceholder}
                    value={route.nexthop}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRoute(index, "nexthop", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove host route ${index + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onHostRoutesChange(
                      hostRoutes.filter(
                        (_, routeIndex) => routeIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
