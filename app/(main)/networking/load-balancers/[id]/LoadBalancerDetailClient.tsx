"use client";

import { useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Activity, Network, Waypoints } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  loadBalancerDetailsQueryOptions,
  loadBalancerFloatingIpsQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  networkQueryOptions,
  portQueryOptions,
  subnetQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  formatOctaviaStatus,
  isOctaviaProvisioning,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import { formatUtcTimestamp } from "@/lib/openstack/time";

function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge variant={octaviaStatusVariant(status)}>
      {formatOctaviaStatus(status)}
    </Badge>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function nameOrId(name: string | undefined, id: string) {
  return name || id;
}

export function LoadBalancerDetailClient({
  id,
  neutronAvailable,
  projectId,
  regionId,
}: {
  id: string;
  neutronAvailable: boolean;
  projectId?: string;
  regionId?: string;
}) {
  const detailsQuery = useMemo(
    () => loadBalancerDetailsQueryOptions(regionId, projectId, id),
    [id, projectId, regionId],
  );
  const { data } = useSuspenseQuery({
    ...detailsQuery,
    refetchInterval: ({ state }) =>
      state.data && isOctaviaProvisioning(state.data.loadBalancer)
        ? 5_000
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const { loadBalancer } = data;
  const neutronLookupAvailable = Boolean(
    neutronAvailable && regionId && projectId,
  );
  const networkQuery = useQuery({
    ...networkQueryOptions(
      neutronAvailable ? regionId : undefined,
      neutronAvailable ? projectId : undefined,
      neutronAvailable ? (loadBalancer.vip_network_id ?? "") : "",
    ),
    retry: false,
  });
  const subnetQuery = useQuery({
    ...subnetQueryOptions(
      neutronAvailable ? regionId : undefined,
      neutronAvailable ? projectId : undefined,
      neutronAvailable ? (loadBalancer.vip_subnet_id ?? "") : "",
    ),
    retry: false,
  });
  const portQuery = useQuery({
    ...portQueryOptions(
      neutronAvailable ? regionId : undefined,
      neutronAvailable ? projectId : undefined,
      neutronAvailable ? (loadBalancer.vip_port_id ?? "") : "",
    ),
    retry: false,
  });
  const floatingIpsQuery = useQuery({
    ...loadBalancerFloatingIpsQueryOptions(
      neutronLookupAvailable ? regionId : undefined,
      neutronLookupAvailable ? projectId : undefined,
      neutronLookupAvailable
        ? (loadBalancer.vip_port_id ?? undefined)
        : undefined,
    ),
    retry: false,
  });
  const floatingIps = floatingIpsQuery.data ?? [];
  const poolById = useMemo(
    () => new Map(data.pools.map((pool) => [pool.id, pool])),
    [data.pools],
  );
  const listenerById = useMemo(
    () => new Map(data.listeners.map((listener) => [listener.id, listener])),
    [data.listeners],
  );
  const membersByPool = new Map<string, typeof data.members>();
  for (const member of data.members) {
    membersByPool.set(member.pool_id, [
      ...(membersByPool.get(member.pool_id) ?? []),
      member,
    ]);
  }
  const rulesByPolicy = new Map<string, typeof data.l7Rules>();
  for (const rule of data.l7Rules) {
    rulesByPolicy.set(rule.l7policy_id, [
      ...(rulesByPolicy.get(rule.l7policy_id) ?? []),
      rule,
    ]);
  }

  return (
    <div className="max-w-screen-xl space-y-6">
      <RecentResourceTracker
        kind="load-balancer"
        id={loadBalancer.id}
        name={loadBalancer.name || "Unnamed load balancer"}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Waypoints className="size-5 text-muted-foreground" />
            <h1 className="truncate text-2xl font-semibold">
              {loadBalancer.name || "Unnamed load balancer"}
            </h1>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <p className="truncate font-mono text-sm text-muted-foreground">
              {loadBalancer.id}
            </p>
            <CopyButton value={loadBalancer.id} label="Copy load balancer ID" />
          </div>
        </div>
        <Badge variant="outline">Read-only</Badge>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Current status</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Operating</p>
            <div className="mt-2">
              <StatusBadge status={loadBalancer.operating_status} />
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Provisioning</p>
            <div className="mt-2">
              {isOctaviaProvisioning(loadBalancer) ? (
                <ProgressStatusBadge
                  label={formatOctaviaStatus(loadBalancer.provisioning_status)}
                />
              ) : (
                <StatusBadge status={loadBalancer.provisioning_status} />
              )}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Listeners</p>
            <p className="mt-2 text-sm font-medium">{data.listeners.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Pool members</p>
            <p className="mt-2 text-sm font-medium">{data.members.length}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Load balancer">
          <DetailField label="Description">
            {loadBalancer.description || "-"}
          </DetailField>
          <DetailField label="Project ID">
            <span className="font-mono text-xs">{loadBalancer.project_id}</span>
          </DetailField>
          <DetailField label="Provider">
            {loadBalancer.provider || "-"}
          </DetailField>
          <DetailField label="Flavor ID">
            {loadBalancer.flavor_id ? (
              <span className="font-mono text-xs">
                {loadBalancer.flavor_id}
              </span>
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Availability zone">
            {loadBalancer.availability_zone || "-"}
          </DetailField>
          <DetailField label="Administrative state">
            {loadBalancer.admin_state_up ? "Up" : "Down"}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(loadBalancer.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(loadBalancer.updated_at)}
          </DetailField>
        </DetailSection>

        <DetailSection title="Virtual IP">
          <DetailField label="Address">
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              {loadBalancer.vip_address || "-"}
              {loadBalancer.vip_address ? (
                <CopyButton
                  value={loadBalancer.vip_address}
                  label="Copy VIP address"
                />
              ) : null}
            </span>
          </DetailField>
          <DetailField label="Floating IPs">
            {!loadBalancer.vip_port_id ? (
              "-"
            ) : !neutronLookupAvailable || floatingIpsQuery.isError ? (
              <span className="text-muted-foreground">Lookup unavailable.</span>
            ) : floatingIpsQuery.isLoading ? (
              <span className="text-muted-foreground">Loading</span>
            ) : floatingIps.length > 0 ? (
              <span className="flex flex-col items-start gap-1">
                {floatingIps.map((floatingIp) => (
                  <ResourceLink
                    href={`/networking/floating-ips/${encodeURIComponent(floatingIp.id)}`}
                    key={floatingIp.id}
                  >
                    {floatingIp.floating_ip_address}
                  </ResourceLink>
                ))}
              </span>
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Network">
            {loadBalancer.vip_network_id ? (
              neutronAvailable ? (
                <ResourceLink
                  href={`/networking/networks/${encodeURIComponent(loadBalancer.vip_network_id)}`}
                  title={loadBalancer.vip_network_id}
                >
                  {networkQuery.data?.name || loadBalancer.vip_network_id}
                </ResourceLink>
              ) : (
                <span className="font-mono text-xs">
                  {loadBalancer.vip_network_id}
                </span>
              )
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Subnet">
            {loadBalancer.vip_subnet_id ? (
              neutronAvailable ? (
                <ResourceLink
                  href={`/networking/networks/${encodeURIComponent(loadBalancer.vip_network_id ?? subnetQuery.data?.network_id ?? "")}`}
                  title={loadBalancer.vip_subnet_id}
                >
                  {subnetQuery.data?.name ||
                    subnetQuery.data?.cidr ||
                    loadBalancer.vip_subnet_id}
                </ResourceLink>
              ) : (
                <span className="font-mono text-xs">
                  {loadBalancer.vip_subnet_id}
                </span>
              )
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="Port">
            {loadBalancer.vip_port_id ? (
              neutronAvailable ? (
                <ResourceLink
                  href={`/networking/ports/${encodeURIComponent(loadBalancer.vip_port_id)}`}
                  title={loadBalancer.vip_port_id}
                >
                  {portQuery.data?.name || loadBalancer.vip_port_id}
                </ResourceLink>
              ) : (
                <span className="font-mono text-xs">
                  {loadBalancer.vip_port_id}
                </span>
              )
            ) : (
              "-"
            )}
          </DetailField>
          <DetailField label="vNIC type">
            {loadBalancer.vip_vnic_type || "-"}
          </DetailField>
          <DetailField label="Security groups">
            {loadBalancer.vip_sg_ids?.length ?? 0}
          </DetailField>
          <DetailField label="QoS policy ID">
            {loadBalancer.vip_qos_policy_id || "-"}
          </DetailField>
        </DetailSection>
      </div>

      {data.stats ? (
        <DetailSection title="Traffic statistics">
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Active connections", data.stats.active_connections],
              ["Total connections", data.stats.total_connections],
              ["Request errors", data.stats.request_errors],
              ["Bytes in", formatBytes(data.stats.bytes_in)],
              ["Bytes out", formatBytes(data.stats.bytes_out)],
            ].map(([label, value]) => (
              <div className="bg-background p-3" key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Listeners</h2>
          <Badge variant="outline">{data.listeners.length}</Badge>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Default pool</TableHead>
                <TableHead>Operating</TableHead>
                <TableHead>Provisioning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.listeners.length ? (
                data.listeners.map((listener) => (
                  <TableRow key={listener.id}>
                    <TableCell>
                      <div>{nameOrId(listener.name, listener.id)}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {listener.id}
                      </div>
                    </TableCell>
                    <TableCell>{listener.protocol}</TableCell>
                    <TableCell>{listener.protocol_port}</TableCell>
                    <TableCell>
                      {listener.default_pool_id
                        ? nameOrId(
                            poolById.get(listener.default_pool_id)?.name,
                            listener.default_pool_id,
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={listener.operating_status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={listener.provisioning_status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No listeners are configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Waypoints className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pools and members</h2>
          <Badge variant="outline">{data.pools.length}</Badge>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>Listener</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Operating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pools.length ? (
                data.pools.map((pool) => (
                  <TableRow key={pool.id}>
                    <TableCell>
                      <div>{nameOrId(pool.name, pool.id)}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {pool.id}
                      </div>
                    </TableCell>
                    <TableCell>{pool.protocol}</TableCell>
                    <TableCell>{pool.lb_algorithm}</TableCell>
                    <TableCell>
                      {pool.listeners?.length
                        ? pool.listeners
                            .map(({ id: listenerId }) =>
                              nameOrId(
                                listenerById.get(listenerId)?.name,
                                listenerId,
                              ),
                            )
                            .join(", ")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {membersByPool.get(pool.id)?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={pool.operating_status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No pools are configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {data.members.length ? (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Operating</TableHead>
                  <TableHead>Provisioning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{nameOrId(member.name, member.id)}</TableCell>
                    <TableCell>
                      {nameOrId(
                        poolById.get(member.pool_id)?.name,
                        member.pool_id,
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {member.address}:{member.protocol_port}
                    </TableCell>
                    <TableCell>{member.weight ?? "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={member.operating_status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={member.provisioning_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>

      {data.healthMonitors.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Health monitors</h2>
            <Badge variant="outline">{data.healthMonitors.length}</Badge>
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Operating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.healthMonitors.map((monitor) => (
                  <TableRow key={monitor.id}>
                    <TableCell>{nameOrId(monitor.name, monitor.id)}</TableCell>
                    <TableCell>{monitor.type}</TableCell>
                    <TableCell>{monitor.delay}s</TableCell>
                    <TableCell>{monitor.timeout}s</TableCell>
                    <TableCell>{monitor.max_retries}</TableCell>
                    <TableCell>
                      <StatusBadge status={monitor.operating_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {data.l7Policies.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">L7 policies</h2>
            <Badge variant="outline">{data.l7Policies.length}</Badge>
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Listener</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.l7Policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>{nameOrId(policy.name, policy.id)}</TableCell>
                    <TableCell>
                      {nameOrId(
                        listenerById.get(policy.listener_id)?.name,
                        policy.listener_id,
                      )}
                    </TableCell>
                    <TableCell>{formatOctaviaStatus(policy.action)}</TableCell>
                    <TableCell>{policy.position}</TableCell>
                    <TableCell>
                      {(rulesByPolicy.get(policy.id) ?? [])
                        .map(
                          (rule) =>
                            `${formatOctaviaStatus(rule.type)} ${formatOctaviaStatus(rule.compare_type)} ${rule.value}`,
                        )
                        .join(" · ") || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {loadBalancer.tags?.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {loadBalancer.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
