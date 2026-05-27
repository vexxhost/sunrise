import Link from "next/link";
import type { ComponentType } from "react";
import { Activity, Boxes, CheckCircle2, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/session";
import {
  listClusterTemplatesAction,
  listClustersAction,
} from "@/lib/openstack/magnum";
import type { MagnumCluster, MagnumClusterTemplate } from "@/types/openstack";

function displayStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusVariant(status: string) {
  if (status.endsWith("FAILED")) return "destructive" as const;
  if (status.endsWith("IN_PROGRESS")) return "secondary" as const;
  if (status.endsWith("COMPLETE")) return "default" as const;
  return "outline" as const;
}

function isKubernetesCluster(
  cluster: MagnumCluster,
  templatesById: Map<string, MagnumClusterTemplate>,
) {
  const embeddedCoe = cluster.cluster_template?.coe?.toLowerCase();
  if (embeddedCoe) {
    return embeddedCoe === "kubernetes" || embeddedCoe.startsWith("k8s");
  }

  return templatesById.has(cluster.cluster_template_id);
}

function totalNodes(cluster: MagnumCluster) {
  return (cluster.master_count ?? 0) + (cluster.node_count ?? 0);
}

function nodeSplit(cluster: MagnumCluster) {
  return `${cluster.master_count ?? 0} control / ${cluster.node_count ?? 0} worker`;
}

function isCompleteCluster(cluster: MagnumCluster) {
  return cluster.status.endsWith("_COMPLETE");
}

function minorVersion(version: string | undefined) {
  const match = version?.match(/^v?(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : "-";
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function CapabilityLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}

export default async function KubernetesPage() {
  const session = await getSession();
  const [clusters, templates] = await Promise.all([
    listClustersAction({}, session.regionId),
    listClusterTemplatesAction({}, session.regionId),
  ]);
  const templatesById = new Map(
    templates.map((template) => [template.uuid, template]),
  );
  const kubernetesClusters = clusters.filter((cluster) =>
    isKubernetesCluster(cluster, templatesById),
  );
  const healthyClusters = kubernetesClusters.filter(
    (cluster) => cluster.health_status === "HEALTHY",
  ).length;
  const completeClusters = kubernetesClusters.filter(isCompleteCluster).length;
  const failedClusters = kubernetesClusters.filter((cluster) =>
    cluster.status.endsWith("_FAILED"),
  ).length;
  const nodeCount = kubernetesClusters.reduce(
    (sum, cluster) => sum + totalNodes(cluster),
    0,
  );

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Kubernetes</h1>
        <p className="max-w-3xl text-muted-foreground">
          Deploy and operate Magnum-backed Kubernetes clusters on OpenStack,
          with cluster templates, node groups, networking, and storage surfaced
          as first-class controls.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Boxes}
          label="Clusters"
          value={String(kubernetesClusters.length)}
          detail={`${completeClusters} complete / ${failedClusters} failed`}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Health"
          value={String(healthyClusters)}
          detail="Clusters reported healthy"
        />
        <MetricTile
          icon={Activity}
          label="Nodes"
          value={String(nodeCount)}
          detail="Control and worker node capacity"
        />
        <MetricTile
          icon={Settings}
          label="Templates"
          value={String(templates.length)}
          detail="Cluster templates"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Manage</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <CapabilityLink
            href="/kubernetes/clusters"
            icon={Boxes}
            title="Clusters"
            description="Inspect lifecycle status, health, Kubernetes versions, and API endpoints."
          />
          <CapabilityLink
            href="/kubernetes/templates"
            icon={Settings}
            title="Cluster templates"
            description="Review Magnum templates, flavors, image IDs, drivers, and visibility."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Recent clusters</h2>
          <Link
            href="/kubernetes/clusters"
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            View all
          </Link>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kubernetesClusters.length ? (
                kubernetesClusters.slice(0, 5).map((cluster) => {
                  const template =
                    cluster.cluster_template ??
                    templatesById.get(cluster.cluster_template_id);

                  return (
                    <TableRow key={cluster.uuid}>
                      <TableCell>
                        <Link
                          href={`/kubernetes/clusters/${cluster.uuid}`}
                          className="underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {cluster.name || cluster.uuid}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={statusVariant(cluster.status)}>
                            {displayStatus(cluster.status)}
                          </Badge>
                          {cluster.health_status ? (
                            <Badge
                              variant={
                                cluster.health_status === "HEALTHY"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {displayStatus(cluster.health_status)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{template?.name ?? "-"}</TableCell>
                      <TableCell>{nodeSplit(cluster)}</TableCell>
                      <TableCell>
                        {minorVersion(
                          cluster.coe_version ?? template?.labels?.kube_tag,
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No Kubernetes clusters found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
