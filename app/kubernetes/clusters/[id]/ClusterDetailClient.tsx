'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useSuspenseQuery } from "@/lib/tanstack";
import {
  clusterEventsQueryOptions,
  clusterQueryOptions,
  clusterTemplatesQueryOptions,
} from "@/hooks/queries/useMagnum";
import type {
  MagnumCluster,
  MagnumClusterTemplate,
  MagnumClusterEventsResponse,
  MagnumClusterEvent,
  MagnumClusterNodeGroup,
} from "@/types/openstack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Server, ShieldCheck } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";

interface ClusterDetailClientProps {
  regionId?: string;
  projectId?: string;
  clusterId: string;
}

function statusVariant(status: string) {
  if (status.endsWith("IN_PROGRESS")) {
    return "outline" as const;
  }
  if (status.endsWith("FAILED")) {
    return "destructive" as const;
  }
  if (status.endsWith("COMPLETE")) {
    return "default" as const;
  }
  return "secondary" as const;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  try {
    return format(parseISO(value), "yyyy-MM-dd HH:mm:ss");
  } catch {
    return value;
  }
}

function formatRelative(value?: string | null) {
  if (!value) {
    return "-";
  }

  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return value;
  }
}

export function ClusterDetailClient({ regionId, projectId, clusterId }: ClusterDetailClientProps) {
  const router = useRouter();
  const { data: cluster } = useSuspenseQuery<MagnumCluster>(
    clusterQueryOptions(regionId, projectId, clusterId),
  );
  const { data: eventsData } = useSuspenseQuery<MagnumClusterEventsResponse>(
    clusterEventsQueryOptions(regionId, projectId, clusterId),
  );
  const { data: templates } = useSuspenseQuery<MagnumClusterTemplate[]>(
    clusterTemplatesQueryOptions(regionId, projectId),
  );

  const templateMap = useMemo(() => {
    const map: Record<string, MagnumClusterTemplate> = {};
    templates.forEach((template: MagnumClusterTemplate) => {
      map[template.uuid] = template;
    });
    return map;
  }, [templates]);

  const template = cluster.cluster_template || templateMap[cluster.cluster_template_id];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-fit gap-2 px-0 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/kubernetes/clusters")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to clusters
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{cluster.name}</h1>
            <Badge variant={statusVariant(cluster.status)}>
              {cluster.status.replace(/_/g, " ")}
            </Badge>
            {cluster.health_status && (
              <Badge variant={cluster.health_status === "HEALTHY" ? "default" : "destructive"}>
                {cluster.health_status}
              </Badge>
            )}
          </div>
          {cluster.status_reason && (
            <p className="text-sm text-muted-foreground">{cluster.status_reason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {cluster.api_address && (
            <Button asChild variant="outline" className="gap-2">
              <Link href={cluster.api_address} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open API endpoint
              </Link>
            </Button>
          )}
          {cluster.discovery_url && (
            <Button asChild variant="outline" className="gap-2">
              <Link href={cluster.discovery_url} target="_blank" rel="noreferrer">
                <ShieldCheck className="h-4 w-4" />
                Discovery URL
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cluster Summary</CardTitle>
            <CardDescription>Control plane metadata pulled from Magnum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">UUID</span>
              <span className="font-mono text-sm">{cluster.uuid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stack ID</span>
              <span className="font-mono text-sm">{cluster.stack_id ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Template</span>
              <span className="text-sm">
                {template ? (
                  <>
                    {template.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">({template.uuid})</span>
                  </>
                ) : (
                  cluster.cluster_template_id
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">COE / Container</span>
              <span className="text-sm">
                {cluster.coe_version ?? "n/a"} / {cluster.container_version ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatDate(cluster.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Updated</span>
              <span className="text-sm">{formatRelative(cluster.updated_at)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access & Networking</CardTitle>
            <CardDescription>Primary endpoints and networking references.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">API Address</span>
              <span className="text-sm">
                {cluster.api_address ? (
                  <Link
                    href={cluster.api_address}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {cluster.api_address}
                  </Link>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Master Addresses</span>
              <span className="text-sm">
                {cluster.master_addresses?.length
                  ? cluster.master_addresses.join(", ")
                  : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Worker Addresses</span>
              <span className="text-sm">
                {cluster.node_addresses?.length ? cluster.node_addresses.join(", ") : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixed Network</span>
              <span className="text-sm">{cluster.fixed_network ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixed Subnet</span>
              <span className="text-sm">{cluster.fixed_subnet ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Floating IP</span>
              <span className="text-sm">
                {cluster.floating_ip_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="nodes">Node groups</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Labels & Metadata</CardTitle>
              <CardDescription>Key-value labels applied to this cluster.</CardDescription>
            </CardHeader>
            <CardContent>
              {cluster.labels && Object.keys(cluster.labels).length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(cluster.labels).map(([key, rawValue]) => {
                    const value = String(rawValue);
                    return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <span className="text-sm font-medium">{key}</span>
                      <span className="font-mono text-xs text-muted-foreground">{value}</span>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No labels present on this cluster.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nodes">
          <Card>
            <CardHeader>
              <CardTitle>Node Groups</CardTitle>
              <CardDescription>Magnum-managed partitions of the cluster.</CardDescription>
            </CardHeader>
            <CardContent>
              {cluster.nodegroups?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Roles</th>
                        <th className="px-3 py-2 font-medium">Nodes</th>
                        <th className="px-3 py-2 font-medium">Flavor</th>
                        <th className="px-3 py-2 font-medium">Image</th>
                        <th className="px-3 py-2 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cluster.nodegroups.map((nodegroup: MagnumClusterNodeGroup) => (
                        <tr key={nodegroup.uuid} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-primary" />
                              <span className="font-medium">{nodegroup.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">{nodegroup.roles.join(", ") || "-"}</td>
                          <td className="px-3 py-2">{nodegroup.node_count}</td>
                          <td className="px-3 py-2">{nodegroup.flavor_id ?? "-"}</td>
                          <td className="px-3 py-2">{nodegroup.image_id ?? "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatRelative(nodegroup.updated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Magnum has not reported node groups for this cluster yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>Lifecycle updates and health changes reported by Magnum.</CardDescription>
            </CardHeader>
            <CardContent>
              {eventsData.events.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-3 py-2 font-medium">Timestamp</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Level</th>
                        <th className="px-3 py-2 font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsData.events.map((event: MagnumClusterEvent) => (
                        <tr key={event.uuid} className="border-b last:border-0">
                          <td className="px-3 py-2">{formatDate(event.created_at)}</td>
                          <td className="px-3 py-2 font-medium">{event.type}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                event.level === "ERROR"
                                  ? "destructive"
                                  : event.level === "WARNING"
                                    ? "outline"
                                    : "secondary"
                              }
                            >
                              {event.level ?? "INFO"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{event.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No events recorded for this cluster.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

