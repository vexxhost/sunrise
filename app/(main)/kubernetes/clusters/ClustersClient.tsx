"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import {
  clusterTemplatesQueryOptions,
  clustersQueryOptions,
} from "@/hooks/queries/useMagnum";
import type { MagnumCluster, MagnumClusterTemplate } from "@/types/openstack";

interface ClustersClientProps {
  regionId?: string;
  projectId?: string;
}

function statusVariant(status: string) {
  if (status.endsWith("FAILED")) return "destructive" as const;
  if (status.endsWith("IN_PROGRESS")) return "secondary" as const;
  if (status.endsWith("COMPLETE")) return "default" as const;
  return "outline" as const;
}

function displayStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function minorVersion(version: string | undefined) {
  const match = version?.match(/^v?(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : "-";
}

function formatAge(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "-";
  }

  return formatDistanceToNow(timestamp);
}

function isKubernetesCluster(
  cluster: MagnumCluster,
  templatesById: Map<string, MagnumClusterTemplate>,
) {
  const template =
    cluster.cluster_template ?? templatesById.get(cluster.cluster_template_id);
  if (!template) return false;

  const coe = template.coe?.toLowerCase();
  return coe === "kubernetes" || coe?.startsWith("k8s");
}

function clusterColumns(
  templatesById: Map<string, MagnumClusterTemplate>,
): ColumnDef<MagnumCluster>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: { row: { original: MagnumCluster } }) => (
        <Link
          href={`/kubernetes/clusters/${row.original.uuid}`}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {row.original.name || row.original.uuid}
        </Link>
      ),
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
    {
      accessorKey: "uuid",
      header: "ID",
      meta: {
        fieldType: "string",
        monospace: true,
        visible: true,
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: MagnumCluster } }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant(row.original.status)}>
            {displayStatus(row.original.status)}
          </Badge>
          {row.original.health_status ? (
            <Badge
              variant={
                row.original.health_status === "HEALTHY"
                  ? "default"
                  : "destructive"
              }
            >
              {displayStatus(row.original.health_status)}
            </Badge>
          ) : null}
        </div>
      ),
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
    {
      accessorKey: "cluster_template_id",
      header: "Template",
      cell: ({ row }: { row: { original: MagnumCluster } }) => {
        const template =
          row.original.cluster_template ??
          templatesById.get(row.original.cluster_template_id);
        return template?.name ?? row.original.cluster_template_id ?? "-";
      },
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
    {
      accessorKey: "node_count",
      header: "Nodes",
      cell: ({ row }: { row: { original: MagnumCluster } }) =>
        `${row.original.master_count ?? 0} control / ${row.original.node_count ?? 0} worker`,
      meta: {
        fieldType: "number",
        visible: true,
      },
    },
    {
      id: "node_groups",
      accessorFn: (cluster) => cluster.nodegroups?.length ?? 0,
      header: "Node Groups",
      cell: ({ row }: { row: { original: MagnumCluster } }) =>
        row.original.nodegroups?.length ?? "-",
      meta: {
        fieldType: "number",
        visible: true,
      },
    },
    {
      accessorKey: "coe_version",
      header: "Version",
      cell: ({ row }: { row: { original: MagnumCluster } }) => {
        const template =
          row.original.cluster_template ??
          templatesById.get(row.original.cluster_template_id);
        return minorVersion(
          row.original.coe_version ?? template?.labels?.kube_tag,
        );
      },
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
    {
      accessorKey: "created_at",
      header: "Age",
      cell: ({ row }: { row: { original: MagnumCluster } }) =>
        formatAge(row.original.created_at),
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
  ];
}

export function ClustersClient({ regionId, projectId }: ClustersClientProps) {
  const {
    data: clusters,
    isRefetching,
    refetch,
  } = useSuspenseQuery(clustersQueryOptions(regionId, projectId));
  const { data: templates } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );

  const templatesById = useMemo(() => {
    return new Map(templates.map((template) => [template.uuid, template]));
  }, [templates]);

  const kubernetesClusters = useMemo(
    () =>
      clusters.filter((cluster) => isKubernetesCluster(cluster, templatesById)),
    [clusters, templatesById],
  );

  const columns = useMemo(() => clusterColumns(templatesById), [templatesById]);

  return (
    <div className="space-y-4">
      <DataTable
        data={kubernetesClusters}
        isRefetching={isRefetching}
        refetch={refetch}
        columns={columns}
        resourceName="cluster"
        emptyIcon={Activity}
      />
    </div>
  );
}
