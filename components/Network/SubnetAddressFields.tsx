"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AllocationPool } from "@/types/openstack";

interface SubnetAddressFieldsProps {
  allocationPools: AllocationPool[];
  disabled: boolean;
  dnsNameservers: string[];
  idPrefix: string;
  onAllocationPoolsChange: (pools: AllocationPool[]) => void;
  onDnsNameserversChange: (servers: string[]) => void;
}

export function SubnetAddressFields({
  allocationPools,
  disabled,
  dnsNameservers,
  idPrefix,
  onAllocationPoolsChange,
  onDnsNameserversChange,
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
                    placeholder="10.0.0.10"
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
                    placeholder="10.0.0.250"
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
                    placeholder="1.1.1.1"
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
    </div>
  );
}
