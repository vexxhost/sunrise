"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { shareNetworkQueryOptions } from "@/hooks/queries/useManila";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const timestamp = new Date(normalizeOpenStackTimestamp(value));
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

export function ShareNetworkDetailClient({
  networkId,
  projectId,
  regionId,
}: {
  networkId: string;
  projectId?: string;
  regionId?: string;
}) {
  const query = useMemo(
    () => shareNetworkQueryOptions(regionId, projectId, networkId),
    [networkId, projectId, regionId],
  );
  const { data: network } = useSuspenseQuery(query);
  const subnets = network.share_network_subnets ?? [];

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="space-y-1">
        <h1 className="truncate text-2xl font-semibold">
          {network.name || "Unnamed share network"}
        </h1>
        <p className="truncate font-mono text-sm text-muted-foreground">
          {network.id}
        </p>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Share Network">
          <DetailField label="Name">{emptyToDash(network.name)}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {network.id}
          </DetailField>
          <DetailField label="Description">
            {emptyToDash(network.description)}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {emptyToDash(network.project_id)}
          </DetailField>
          <DetailField label="Created">
            {formatTimestamp(network.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatTimestamp(network.updated_at)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Network Subnets">
          {subnets.length ? (
            subnets.map((subnet, index) => (
              <DetailField key={subnet.id} label={`Subnet ${index + 1}`}>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Manila ID: </span>
                    <span className="font-mono text-xs">{subnet.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Neutron network:{" "}
                    </span>
                    {subnet.neutron_net_id ? (
                      <ResourceLink
                        href={`/compute/networks/resources/${encodeURIComponent(subnet.neutron_net_id)}`}
                        className="font-mono text-xs"
                      >
                        {subnet.neutron_net_id}
                      </ResourceLink>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Neutron subnet:{" "}
                    </span>
                    <span className="font-mono text-xs">
                      {emptyToDash(subnet.neutron_subnet_id)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Availability zone:{" "}
                    </span>
                    {emptyToDash(subnet.availability_zone)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">CIDR: </span>
                    {emptyToDash(subnet.cidr)}
                  </div>
                </div>
              </DetailField>
            ))
          ) : (
            <DetailField label="Subnets">-</DetailField>
          )}
        </DetailSection>
      </div>
    </div>
  );
}
