"use client";

import { useMemo, useState } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Activity, Network, Plus, Trash2, Waypoints } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ResourceNameCell } from "@/components/DataTable/ResourceNameCell";
import {
  ListenerMutationDialog,
  type ListenerDialogAction,
} from "@/components/LoadBalancer/ListenerMutationDialog";
import {
  LoadBalancerMutationDialog,
  type LoadBalancerMutationKind,
} from "@/components/LoadBalancer/LoadBalancerMutationDialog";
import { OctaviaTagList } from "@/components/LoadBalancer/OctaviaTags";
import {
  PoolMutationDialog,
  type PoolDialogAction,
} from "@/components/LoadBalancer/PoolMutationDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  loadBalancersQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  networkQueryOptions,
  portQueryOptions,
  subnetQueryOptions,
} from "@/hooks/queries/useNetworks";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  formatOctaviaStatus,
  isOctaviaAmphoraProvider,
  isOctaviaProvisioning,
  loadBalancerListenerPath,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import { formatPoolAlgorithm } from "@/lib/openstack/octavia-pool-settings";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type {
  OpenStackFeatureSupport,
  OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";

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
  octaviaCapabilities,
  neutronAvailable,
  projectId,
  regionId,
  tagSupport,
}: {
  id: string;
  octaviaCapabilities: OpenStackServiceCapabilities;
  neutronAvailable: boolean;
  projectId: string;
  regionId: string;
  tagSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [action, setAction] = useState<LoadBalancerMutationKind | null>(null);
  const [listenerAction, setListenerAction] =
    useState<ListenerDialogAction | null>(null);
  const [listenerNotice, setListenerNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);
  const [poolAction, setPoolAction] = useState<PoolDialogAction | null>(null);
  const [poolNotice, setPoolNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);
  const detailsQuery = useMemo(
    () => loadBalancerDetailsQueryOptions(regionId, projectId, id),
    [id, projectId, regionId],
  );
  const { data } = useSuspenseQuery({
    ...detailsQuery,
    refetchInterval: ({ state }) =>
      (listenerNotice && Date.now() - listenerNotice.at < 20_000) ||
      (poolNotice && Date.now() - poolNotice.at < 20_000) ||
      (state.data &&
        (isOctaviaProvisioning(state.data.loadBalancer) ||
          state.data.listeners.some(isOctaviaProvisioning) ||
          state.data.pools.some(isOctaviaProvisioning)))
        ? 5_000
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const { loadBalancer } = data;
  const listenerChangesAvailable = canChangeOctaviaListeners(loadBalancer);
  const poolChangesSupported = isOctaviaAmphoraProvider(loadBalancer.provider);
  const openPoolAction = (target: PoolDialogAction) => {
    setPoolNotice(null);
    setPoolAction(target);
  };
  const refreshTopology = () => {
    void queryClient.invalidateQueries({ queryKey: detailsQuery.queryKey });
    void queryClient.invalidateQueries({
      queryKey: loadBalancersQueryOptions(regionId, projectId).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "project-quotas", "load-balancing"],
    });
  };
  const openListenerAction = (target: ListenerDialogAction) => {
    setListenerNotice(null);
    setListenerAction(target);
  };
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
        <div className="flex items-center gap-2">
          <EditActionButton
            disabled={isOctaviaProvisioning(loadBalancer)}
            onClick={() => setAction("edit")}
          />
          <Button
            disabled={isOctaviaProvisioning(loadBalancer)}
            onClick={() => setAction("delete")}
            tone="danger"
            variant="outline"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
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
          {tagSupport.status !== "unsupported" ? (
            <DetailField label="Tags">
              <OctaviaTagList tags={loadBalancer.tags} />
            </DetailField>
          ) : null}
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

      <section id="listeners" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Listeners</h2>
            <Badge variant="outline">{data.listeners.length}</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!listenerChangesAvailable}
            onClick={() => openListenerAction({ action: "create" })}
          >
            <Plus className="size-4" />
            Create listener
          </Button>
        </div>
        {listenerNotice ? (
          <MutationAlert variant="success">
            {listenerNotice.message}
          </MutationAlert>
        ) : null}
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
                <TableHead>
                  <span className="sr-only">Listener actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.listeners.length ? (
                data.listeners.map((listener) => (
                  <TableRow key={listener.id}>
                    <TableCell>
                      <ResourceNameCell
                        href={loadBalancerListenerPath(
                          loadBalancer.id,
                          listener.id,
                        )}
                        value={nameOrId(listener.name, listener.id)}
                      />
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
                      {isOctaviaProvisioning(listener) ? (
                        <ProgressStatusBadge
                          label={formatOctaviaStatus(
                            listener.provisioning_status,
                          )}
                        />
                      ) : (
                        <StatusBadge status={listener.provisioning_status} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <EditActionButton
                          type="button"
                          compact
                          label={
                            "Edit listener " + (listener.name || listener.id)
                          }
                          disabled={
                            !listenerChangesAvailable ||
                            !canChangeOctaviaListener(listener)
                          }
                          onClick={() =>
                            openListenerAction({ action: "edit", listener })
                          }
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          tone="danger"
                          aria-label={
                            "Delete listener " + (listener.name || listener.id)
                          }
                          title="Delete listener"
                          disabled={
                            !listenerChangesAvailable ||
                            !canChangeOctaviaListener(listener)
                          }
                          onClick={() =>
                            openListenerAction({ action: "delete", listener })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={7}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Waypoints className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Pools and members</h2>
            <Badge variant="outline">{data.pools.length}</Badge>
          </div>
          {poolChangesSupported ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!listenerChangesAvailable}
              onClick={() => openPoolAction({ action: "create" })}
            >
              <Plus className="size-4" />
              Create pool
            </Button>
          ) : null}
        </div>
        {poolNotice ? (
          <MutationAlert variant="success">{poolNotice.message}</MutationAlert>
        ) : null}
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
                <TableHead>Provisioning</TableHead>
                {poolChangesSupported ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
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
                    <TableCell>
                      {formatPoolAlgorithm(pool.lb_algorithm)}
                    </TableCell>
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
                    <TableCell>
                      {isOctaviaProvisioning(pool) ? (
                        <ProgressStatusBadge
                          label={formatOctaviaStatus(pool.provisioning_status)}
                        />
                      ) : (
                        <StatusBadge status={pool.provisioning_status} />
                      )}
                    </TableCell>
                    {poolChangesSupported ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <EditActionButton
                            type="button"
                            compact
                            label={"Edit pool " + (pool.name || pool.id)}
                            disabled={
                              !listenerChangesAvailable ||
                              !canChangeOctaviaListener(pool)
                            }
                            onClick={() =>
                              openPoolAction({ action: "edit", pool })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            tone="danger"
                            size="icon-sm"
                            aria-label={"Delete pool " + (pool.name || pool.id)}
                            title={"Delete pool " + (pool.name || pool.id)}
                            disabled={
                              !listenerChangesAvailable ||
                              !canChangeOctaviaListener(pool)
                            }
                            onClick={() =>
                              openPoolAction({ action: "delete", pool })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={poolChangesSupported ? 8 : 7}
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

      {listenerAction ? (
        <ListenerMutationDialog
          target={listenerAction}
          loadBalancer={loadBalancer}
          capabilities={octaviaCapabilities}
          scope={{ projectId, regionId }}
          onClose={() => setListenerAction(null)}
          onSuccess={(message) => {
            setListenerNotice({ message, at: Date.now() });
            setListenerAction(null);
            refreshTopology();
          }}
        />
      ) : null}

      {poolAction ? (
        <PoolMutationDialog
          target={poolAction}
          loadBalancerId={loadBalancer.id}
          provider={loadBalancer.provider}
          capabilities={octaviaCapabilities}
          listeners={data.listeners}
          scope={{ projectId, regionId }}
          onClose={() => setPoolAction(null)}
          onSuccess={(message) => {
            setPoolNotice({ message, at: Date.now() });
            setPoolAction(null);
            refreshTopology();
          }}
        />
      ) : null}

      {action ? (
        <LoadBalancerMutationDialog
          action={action}
          key={`${action}-${loadBalancer.id}`}
          loadBalancer={loadBalancer}
          onComplete={async (deleted) => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: loadBalancersQueryOptions(regionId, projectId)
                  .queryKey,
              }),
              queryClient.invalidateQueries({
                queryKey: detailsQuery.queryKey,
                refetchType: deleted ? "none" : "active",
              }),
            ]);
            if (deleted) {
              router.replace("/networking/load-balancers");
            }
          }}
          onOpenChange={() => setAction(null)}
          scope={{ projectId, regionId }}
          tagSupport={tagSupport}
        />
      ) : null}
    </div>
  );
}
