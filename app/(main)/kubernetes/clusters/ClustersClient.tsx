"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity } from "lucide-react";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import {
  clusterTemplatesQueryOptions,
  clustersQueryOptions,
} from "@/hooks/queries/useMagnum";
import {
  clusterKubernetesVersion,
  kubernetesHealthSummary,
} from "@/lib/openstack/magnum-domain";
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
          {row.original.status.endsWith("_IN_PROGRESS") ? (
            <ProgressStatusBadge label={displayStatus(row.original.status)} />
          ) : (
            <Badge variant={statusVariant(row.original.status)}>
              {displayStatus(row.original.status)}
            </Badge>
          )}
          {row.original.health_status ? (
            <Badge
              title={kubernetesHealthSummary(row.original)}
              variant={
                row.original.health_status.toUpperCase() === "HEALTHY"
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
        return template ? (
          <Link
            className="underline-offset-2 hover:underline focus-visible:underline"
            href={`/kubernetes/templates/${template.uuid}`}
          >
            {template.name}
          </Link>
        ) : (
          (row.original.cluster_template_id ?? "-")
        );
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
        return clusterKubernetesVersion({
          ...row.original,
          cluster_template: template,
        });
      },
      meta: {
        fieldType: "string",
        visible: true,
      },
    },
    {
      accessorKey: "created_at",
      header: "Age",
      meta: {
        fieldType: "date",
        dateDisplay: "age",
        visible: true,
      },
    },
  ];
}

export function ClustersClient({ regionId, projectId }: ClustersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deletingClusterId = searchParams.get("deleting");
  const {
    data: clusters,
    isRefetching,
    refetch,
  } = useSuspenseQuery({
    ...clustersQueryOptions(regionId, projectId),
    refetchInterval: ({ state }) => {
      const current = Array.isArray(state.data) ? state.data : [];
      const pendingDeletion = Boolean(
        deletingClusterId &&
        current.some((cluster) => cluster.uuid === deletingClusterId),
      );
      return pendingDeletion ||
        current.some((cluster) => cluster.status.endsWith("_IN_PROGRESS"))
        ? 5_000
        : false;
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const { data: templates } = useSuspenseQuery(
    clusterTemplatesQueryOptions(regionId, projectId),
  );

  const templatesById = useMemo(() => {
    return new Map(templates.map((template) => [template.uuid, template]));
  }, [templates]);

  useEffect(() => {
    if (
      deletingClusterId &&
      !clusters.some((cluster) => cluster.uuid === deletingClusterId)
    ) {
      router.replace("/kubernetes/clusters", { scroll: false });
    }
  }, [clusters, deletingClusterId, router]);

  const clustersWithPendingDeletion = useMemo(
    () =>
      clusters.map((cluster) =>
        cluster.uuid === deletingClusterId
          ? {
              ...cluster,
              status: "DELETE_IN_PROGRESS",
              status_reason: "Magnum accepted the cluster deletion request.",
            }
          : cluster,
      ),
    [clusters, deletingClusterId],
  );

  const kubernetesClusters = useMemo(
    () =>
      clustersWithPendingDeletion.filter((cluster) =>
        isKubernetesCluster(cluster, templatesById),
      ),
    [clustersWithPendingDeletion, templatesById],
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
