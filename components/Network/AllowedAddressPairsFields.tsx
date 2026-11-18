"use client";

import { Plus, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AllowedAddressPairInput {
  ipAddress: string;
  macAddress: string;
}

interface AllowedAddressPairsFieldsProps {
  disabled: boolean;
  idPrefix: string;
  onValueChange: (value: AllowedAddressPairInput[]) => void;
  portSecurityEnabled: boolean;
  value: AllowedAddressPairInput[];
}

export function AllowedAddressPairsFields({
  disabled,
  idPrefix,
  onValueChange,
  portSecurityEnabled,
  value,
}: AllowedAddressPairsFieldsProps) {
  const updatePair = (
    index: number,
    field: keyof AllowedAddressPairInput,
    nextValue: string,
  ) => {
    onValueChange(
      value.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, [field]: nextValue } : pair,
      ),
    );
  };
  const hasAnyIpv4Pair = value.some(
    (pair) => pair.ipAddress.trim() === "0.0.0.0/0",
  );

  return (
    <section className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label>Allowed address pairs</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Additional IP or CIDR and MAC combinations that may send traffic
            through this port. An empty MAC uses the port MAC. Cloud policy may
            require the values to match another port you own on this network.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !portSecurityEnabled}
          onClick={() =>
            onValueChange([...value, { ipAddress: "", macAddress: "" }])
          }
        >
          <Plus className="size-4" />
          Add pair
        </Button>
      </div>

      {!portSecurityEnabled ? (
        <p className="text-xs text-muted-foreground">
          Enable port security to configure allowed address pairs.
        </p>
      ) : null}

      {value.length ? (
        <div className="space-y-2">
          {value.map((pair, index) => (
            <div
              key={`${idPrefix}-pair-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-pair-ip-${index}`}>
                  IP address or CIDR
                </Label>
                <Input
                  id={`${idPrefix}-pair-ip-${index}`}
                  required
                  placeholder="192.0.2.10 or 192.0.2.0/24"
                  value={pair.ipAddress}
                  disabled={disabled || !portSecurityEnabled}
                  onChange={(event) =>
                    updatePair(index, "ipAddress", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-pair-mac-${index}`}>
                  MAC address (optional)
                </Label>
                <Input
                  id={`${idPrefix}-pair-mac-${index}`}
                  placeholder="fa:16:3e:00:00:01"
                  value={pair.macAddress}
                  disabled={disabled || !portSecurityEnabled}
                  onChange={(event) =>
                    updatePair(index, "macAddress", event.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove allowed address pair ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onValueChange(
                    value.filter((_, pairIndex) => pairIndex !== index),
                  )
                }
                tone="danger"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {hasAnyIpv4Pair ? (
        <MutationAlert title="Broad address pair" variant="warning">
          0.0.0.0/0 can bypass source-address restrictions from remote security
          group rules. Use it only when that behavior is intentional.
        </MutationAlert>
      ) : null}
    </section>
  );
}
