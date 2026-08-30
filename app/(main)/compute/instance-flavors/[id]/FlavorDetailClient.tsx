"use client";

import bytes from "bytes";
import { useSuspenseQuery } from "@tanstack/react-query";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Badge } from "@/components/ui/badge";
import { flavorQueryOptions } from "@/hooks/queries/useServers";

interface FlavorDetailClientProps {
  flavorId: string;
  projectId?: string;
  regionId?: string;
}

function diskSize(value: number) {
  return value > 0 ? `${value} GB` : "None";
}

export function FlavorDetailClient({
  flavorId,
  projectId,
  regionId,
}: FlavorDetailClientProps) {
  const { data: flavor } = useSuspenseQuery(
    flavorQueryOptions(regionId, projectId, flavorId),
  );
  const extraSpecs = Object.entries(flavor.extra_specs ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const swap = Number(flavor.swap || 0);

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {flavor.name}
          </h1>
          <Badge variant={flavor["OS-FLV-DISABLED:disabled"] ? "destructive" : "secondary"}>
            {flavor["OS-FLV-DISABLED:disabled"] ? "Disabled" : "Enabled"}
          </Badge>
          <Badge variant="outline">
            {flavor["os-flavor-access:is_public"] ? "Public" : "Private"}
          </Badge>
        </div>
        <p className="truncate font-mono text-sm text-muted-foreground">
          {flavor.id}
        </p>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Capacity">
          <DetailField label="vCPUs">{flavor.vcpus}</DetailField>
          <DetailField label="Memory">
            {bytes(flavor.ram * 1024 * 1024, { unitSeparator: " " })}
          </DetailField>
          <DetailField label="Root disk">{diskSize(flavor.disk)}</DetailField>
          <DetailField label="Ephemeral disk">
            {diskSize(flavor["OS-FLV-EXT-DATA:ephemeral"])}
          </DetailField>
          <DetailField label="Swap">
            {swap > 0 ? bytes(swap * 1024 * 1024, { unitSeparator: " " }) : "None"}
          </DetailField>
        </DetailSection>

        <DetailSection title="Flavor">
          <DetailField label="Name">{flavor.name}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {flavor.id}
          </DetailField>
          <DetailField label="Description">
            {flavor.description || "No description"}
          </DetailField>
          <DetailField label="Visibility">
            {flavor["os-flavor-access:is_public"] ? "Public" : "Private"}
          </DetailField>
          <DetailField label="State">
            {flavor["OS-FLV-DISABLED:disabled"] ? "Disabled" : "Enabled"}
          </DetailField>
          <DetailField label="RX/TX factor">{flavor.rxtx_factor}</DetailField>
        </DetailSection>

        <DetailSection title="Extra specifications">
          {extraSpecs.length ? (
            extraSpecs.map(([key, value]) => (
              <DetailField key={key} label={key} className="font-mono text-xs">
                {value}
              </DetailField>
            ))
          ) : (
            <DetailField label="Extra specifications">None configured</DetailField>
          )}
        </DetailSection>
      </div>
    </div>
  );
}
