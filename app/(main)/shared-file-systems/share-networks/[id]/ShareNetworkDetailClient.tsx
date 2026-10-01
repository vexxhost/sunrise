"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { ShareNetworkMutationDialog } from "@/components/SharedFileSystem/ShareNetworkMutationDialog";
import { Button } from "@/components/ui/button";
import { shareNetworkQueryOptions } from "@/hooks/queries/useManila";
import { formatUtcTimestamp } from "@/lib/openstack/time";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
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
  const queryClient = useQueryClient();
  const query = useMemo(
    () => shareNetworkQueryOptions(regionId, projectId, networkId),
    [networkId, projectId, regionId],
  );
  const { data: network } = useSuspenseQuery(query);
  const subnets = network.share_network_subnets ?? [];
  const [editing, setEditing] = useState(false);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const refreshNetwork = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: query.queryKey });
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "manila", "share-networks"],
    });
  }, [projectId, query.queryKey, queryClient, regionId]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold">
            {network.name || "Unnamed share network"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {network.id}
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          title="Edit share network"
          disabled={!scope}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" aria-hidden="true" />
          <span className="sr-only">Edit share network</span>
        </Button>
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
            {formatUtcTimestamp(network.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(network.updated_at)}
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

      {editing && scope ? (
        <ShareNetworkMutationDialog
          network={network}
          onComplete={refreshNetwork}
          onOpenChange={() => setEditing(false)}
          scope={scope}
        />
      ) : null}
    </div>
  );
}
