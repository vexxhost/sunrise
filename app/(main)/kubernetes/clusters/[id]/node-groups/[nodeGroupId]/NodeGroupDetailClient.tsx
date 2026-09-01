"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Gauge, HardDrive, Server as ServerIcon } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { imagesQueryOptions } from "@/hooks/queries/useImages";
import {
  clusterNodeGroupsQueryOptions,
  clusterNodeGroupQueryOptions,
  clusterQueryOptions,
} from "@/hooks/queries/useMagnum";
import {
  flavorsQueryOptions,
  serversQueryOptions,
} from "@/hooks/queries/useServers";
import { serversForNodeGroup } from "@/lib/openstack/magnum-domain";
import type { Server } from "@/types/openstack";

interface NodeGroupDetailClientProps {
  clusterId: string;
  nodeGroupId: string;
  projectId?: string;
  regionId?: string;
}

function displayStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function serverAddresses(server: Server) {
  const values = Object.values(server.addresses).flatMap((addresses) =>
    addresses.map(({ addr }) => addr),
  );
  return values.length > 0 ? values.join(", ") : "-";
}

function LabelList({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (entries.length === 0) {
    return (
      <p className="border-y py-5 text-sm text-muted-foreground">
        No labels configured.
      </p>
    );
  }

  return (
    <div className="border-y">
      {entries.map(([key, value]) => (
        <div
          className="grid gap-1 border-b px-1 py-2 text-sm last:border-b-0 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]"
          key={key}
        >
          <span className="break-all font-mono text-xs text-muted-foreground">
            {key}
          </span>
          <span className="break-all font-mono text-xs">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function NodeGroupDetailClient({
  clusterId,
  nodeGroupId,
  projectId,
  regionId,
}: NodeGroupDetailClientProps) {
  const { data: cluster } = useSuspenseQuery(
    clusterQueryOptions(regionId, projectId, clusterId),
  );
  const { data: nodeGroup } = useSuspenseQuery({
    ...clusterNodeGroupQueryOptions(
      regionId,
      projectId,
      clusterId,
      nodeGroupId,
    ),
    refetchInterval: ({ state }) =>
      state.data?.status?.endsWith("_IN_PROGRESS") ? 5_000 : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const { data: nodeGroups } = useSuspenseQuery(
    clusterNodeGroupsQueryOptions(regionId, projectId, clusterId),
  );
  const { data: servers = [] } = useQuery(
    serversQueryOptions(regionId, projectId),
  );
  const { data: flavors = [] } = useQuery(
    flavorsQueryOptions(regionId, projectId),
  );
  const { data: images = [] } = useQuery(
    imagesQueryOptions(regionId, projectId),
  );
  const instances = useMemo(
    () => serversForNodeGroup(nodeGroup, servers, cluster, nodeGroups),
    [cluster, nodeGroup, nodeGroups, servers],
  );
  const flavor = flavors.find(
    (candidate) =>
      candidate.id === nodeGroup.flavor_id ||
      candidate.name === nodeGroup.flavor_id,
  );
  const image = images.find(
    (candidate) =>
      candidate.id === nodeGroup.image_id ||
      candidate.name === nodeGroup.image_id,
  );
  const minimum = nodeGroup.min_node_count ?? nodeGroup.node_count;
  const maximum = nodeGroup.max_node_count ?? null;
  const columns = useMemo<ColumnDef<Server>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            className="font-medium underline-offset-2 hover:underline focus-visible:underline"
            href={`/compute/instances/${row.original.id}/overview`}
          >
            {row.original.name}
          </Link>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        enableHiding: false,
        meta: {
          fieldType: "string",
          monospace: true,
          visible: true,
          idLinkPath: "/compute/instances",
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status.endsWith("ING") ||
          row.original["OS-EXT-STS:task_state"] ? (
            <ProgressStatusBadge label={displayStatus(row.original.status)} />
          ) : (
            <Badge variant="secondary">
              {displayStatus(row.original.status)}
            </Badge>
          ),
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "addresses",
        header: "Addresses",
        accessorFn: serverAddresses,
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "OS-EXT-AZ:availability_zone",
        header: "Availability Zone",
        meta: { fieldType: "string", visible: false },
      },
    ],
    [],
  );

  return (
    <div className="max-w-screen-xl space-y-5">
      <div className="space-y-1">
        <Link
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          href={`/kubernetes/clusters/${cluster.uuid}/node-groups`}
        >
          {cluster.name} node groups
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {nodeGroup.name}
          </h1>
          <Badge variant="outline">{nodeGroup.role || "-"}</Badge>
          {nodeGroup.status?.endsWith("_IN_PROGRESS") ? (
            <ProgressStatusBadge label={displayStatus(nodeGroup.status)} />
          ) : nodeGroup.status ? (
            <Badge variant="secondary">{displayStatus(nodeGroup.status)}</Badge>
          ) : null}
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          {nodeGroup.uuid}
        </p>
      </div>

      {nodeGroup.status_reason ? (
        <div className="border-y border-sky-500/35 bg-sky-500/5 px-1 py-3 text-sm">
          <p className="font-semibold">Latest lifecycle update</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
            {nodeGroup.status_reason}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Boxes className="size-4" /> Role
          </div>
          <div className="mt-2 text-lg font-semibold">
            {nodeGroup.role || "-"}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ServerIcon className="size-4" /> Nodes
          </div>
          <div className="mt-2 text-lg font-semibold tabular-nums">
            {nodeGroup.node_count}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Gauge className="size-4" /> Scaling bounds
          </div>
          <div className="mt-2 text-lg font-semibold tabular-nums">
            {maximum === null ? `${minimum}+` : `${minimum} - ${maximum}`}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="size-4" /> Flavor
          </div>
          <div className="mt-2 truncate text-lg font-semibold">
            {flavor ? (
              <Link
                className="hover:underline focus-visible:underline"
                href={`/compute/instance-flavors/${flavor.id}`}
              >
                {flavor.name}
              </Link>
            ) : (
              nodeGroup.flavor_id || "-"
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="Node-group properties">
          <DetailField label="UUID" className="font-mono text-xs">
            {nodeGroup.uuid}
          </DetailField>
          <DetailField label="Cluster">
            <Link
              className="hover:underline focus-visible:underline"
              href={`/kubernetes/clusters/${cluster.uuid}/overview`}
            >
              {cluster.name}
            </Link>
          </DetailField>
          <DetailField label="Role">{nodeGroup.role || "-"}</DetailField>
          <DetailField label="Default group">
            {nodeGroup.is_default ? "Yes" : "No"}
          </DetailField>
          <DetailField label="Created">
            {nodeGroup.created_at || "-"}
          </DetailField>
          <DetailField label="Updated">
            {nodeGroup.updated_at || "-"}
          </DetailField>
        </DetailSection>
        <DetailSection title="Placement and image">
          <DetailField label="Flavor">
            {flavor ? (
              <Link
                className="hover:underline focus-visible:underline"
                href={`/compute/instance-flavors/${flavor.id}`}
              >
                {flavor.name}
              </Link>
            ) : (
              nodeGroup.flavor_id || "-"
            )}
          </DetailField>
          <DetailField label="Image">
            {image ? (
              <Link
                className="hover:underline focus-visible:underline"
                href={`/compute/images/${image.id}`}
              >
                {image.name}
              </Link>
            ) : (
              nodeGroup.image_id || "Inherited from cluster template"
            )}
          </DetailField>
          <DetailField label="Availability zone">
            {nodeGroup.labels?.availability_zone || "Inherited"}
          </DetailField>
        </DetailSection>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Instances</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nova instances associated through Magnum addresses or the CAPI stack
            identity.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={instances}
          emptyIcon={ServerIcon}
          getRowId={(server) => server.id}
          resourceName="instance"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Kubernetes labels</h2>
          <LabelList labels={nodeGroup.node_labels ?? {}} />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Kubernetes taints</h2>
          {nodeGroup.node_taints?.length ? (
            <div className="border-y">
              {nodeGroup.node_taints.map((taint) => (
                <div
                  className="border-b px-1 py-2 font-mono text-xs last:border-b-0"
                  key={`${taint.key}:${taint.effect}:${taint.value ?? ""}`}
                >
                  {taint.key}
                  {taint.value ? `=${taint.value}` : ""}:{taint.effect}
                </div>
              ))}
            </div>
          ) : (
            <p className="border-y py-5 text-sm text-muted-foreground">
              No taints configured.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
