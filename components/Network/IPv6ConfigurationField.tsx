"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ipv6ConfigurationOptions } from "@/lib/openstack/neutron-ipv6";
import type { IPv6ConfigurationMode } from "@/types/openstack";

export function IPv6ConfigurationField({
  disabled,
  id,
  mode,
  onModeChange,
}: {
  disabled?: boolean;
  id: string;
  mode: IPv6ConfigurationMode;
  onModeChange?: (mode: IPv6ConfigurationMode) => void;
}) {
  const selected =
    ipv6ConfigurationOptions.find((option) => option.value === mode) ??
    ipv6ConfigurationOptions[0];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>IPv6 address configuration</Label>
      <Select
        value={mode}
        disabled={disabled || !onModeChange}
        onValueChange={(value) =>
          onModeChange?.(value as IPv6ConfigurationMode)
        }
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ipv6ConfigurationOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{selected.description}</p>
    </div>
  );
}
