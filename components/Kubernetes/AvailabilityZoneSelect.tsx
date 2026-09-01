"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CLOUD_DEFAULT = "cloud-default";

function uniqueZones(zones: string[], selected: string[] = []) {
  return [...new Set([...selected, ...zones].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function AvailabilityZoneSelect({
  defaultLabel = "Cloud default",
  onValueChange,
  value,
  zones,
}: {
  defaultLabel?: string;
  onValueChange: (value: string) => void;
  value: string;
  zones: string[];
}) {
  const options = uniqueZones(zones, value ? [value] : []);
  return (
    <Select
      value={value || CLOUD_DEFAULT}
      onValueChange={(next) =>
        onValueChange(next === CLOUD_DEFAULT ? "" : next)
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLOUD_DEFAULT}>{defaultLabel}</SelectItem>
        {options.map((zone) => (
          <SelectItem key={zone} value={zone}>
            {zone}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AvailabilityZoneMultiSelect({
  onValueChange,
  value,
  zones,
}: {
  onValueChange: (value: string) => void;
  value: string;
  zones: string[];
}) {
  const selected = value
    .split(",")
    .map((zone) => zone.trim())
    .filter(Boolean);
  const options = uniqueZones(zones, selected);
  const toggle = (zone: string, checked: boolean) => {
    const next = checked
      ? [...selected, zone]
      : selected.filter((selectedZone) => selectedZone !== zone);
    onValueChange([...new Set(next)].join(","));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="w-full justify-between font-normal"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 truncate">
            {selected.length ? selected.join(", ") : "Cloud scheduler"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {options.length ? (
          options.map((zone) => (
            <DropdownMenuCheckboxItem
              checked={selected.includes(zone)}
              key={zone}
              onCheckedChange={(checked) => toggle(zone, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              {zone}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No available zones reported
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
