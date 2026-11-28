"use client";

import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import {
  HealthMonitorMutationDialog,
  type HealthMonitorDialogAction,
} from "@/components/LoadBalancer/HealthMonitorMutationDialog";
import {
  MemberMutationDialog,
  type MemberDialogAction,
} from "@/components/LoadBalancer/MemberMutationDialog";
import { MemberEndpoint } from "@/components/LoadBalancer/MemberEndpoint";
import {
  PoolMutationDialog,
  type PoolDialogAction,
} from "@/components/LoadBalancer/PoolMutationDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
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
  loadBalancerPoolDetailsQueryOptions,
  loadBalancerPoolRedirectPoliciesQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  formatOctaviaStatus,
  isOctaviaAmphoraProvider,
  isOctaviaProvisioning,
  loadBalancerListenerPath,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import {
  canChangeHealthMonitor,
  healthMonitorTypeForPool,
  readHealthMonitorSettings,
} from "@/lib/openstack/octavia-health-monitor-settings";
import { octaviaTlsSecretId } from "@/lib/openstack/octavia-listener-settings";
import {
  canChangeOctaviaPoolMembers,
  formatOctaviaMemberRole,
  formatPoolAlgorithm,
  formatPoolPersistence,
  octaviaPoolDeletionBlock,
  readPoolPersistence,
} from "@/lib/openstack/octavia-pool-settings";
import { formatUtcTimestamp } from "@/lib/openstack/time";

type PoolDetailAction =
  | { kind: "pool"; target: Exclude<PoolDialogAction, { action: "create" }> }
  | { kind: "member"; target: MemberDialogAction }
  | { kind: "monitor"; target: HealthMonitorDialogAction };

function Status({ status }: { status: string | undefined }) {
  return status && isOctaviaProvisioning({ provisioning_status: status }) ? (
    <ProgressStatusBadge label={formatOctaviaStatus(status)} />
  ) : (
    <Badge variant={octaviaStatusVariant(status)}>
      {formatOctaviaStatus(status)}
    </Badge>
  );
}

export function PoolDetailClient({
  loadBalancerId,
  neutronAvailable,
  poolId,
  projectId,
  regionId,
}: {
  loadBalancerId: string;
  neutronAvailable: boolean;
  poolId: string;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<PoolDetailAction | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    at: number;
  } | null>(null);
  const { data, isFetching, isRefetchError } = useSuspenseQuery({
    ...loadBalancerPoolDetailsQueryOptions(
      regionId,
      projectId,
      loadBalancerId,
      poolId,
    ),
    refetchInterval: ({ state }) => {
      const details = state.data;
      if (deletionNotice || state.error || !details) return false;
      const resources = [
        details.loadBalancer,
        details.pool,
        ...(details.members ?? []),
        ...(details.healthMonitor ? [details.healthMonitor] : []),
      ];
      return (notice && Date.now() - notice.at < 20_000) ||
        resources.some(isOctaviaProvisioning)
        ? 5_000
        : false;
    },
  });
  const {
    loadBalancer,
    pool,
    healthMonitor,
    httpMonitorOptionsSupported,
    members,
    listeners,
    backupMembersSupported,
    backendTlsSupported,
  } = data;
  const persistence = readPoolPersistence(pool.session_persistence);
  const memberCaId = octaviaTlsSecretId(pool.ca_tls_container_ref);
  const parentHref = `/networking/load-balancers/${encodeURIComponent(loadBalancer.id)}#pools`;
  const writesSupported = isOctaviaAmphoraProvider(loadBalancer.provider);
  const canChangePoolChildren =
    writesSupported &&
    !isFetching &&
    !isRefetchError &&
    loadBalancer.pools?.some(({ id }) => id === pool.id) &&
    canChangeOctaviaListeners(loadBalancer);
  const canChangePool = canChangePoolChildren && canChangeOctaviaListener(pool);
  const redirectPolicies = useQuery({
    ...loadBalancerPoolRedirectPoliciesQueryOptions(
      regionId,
      projectId,
      loadBalancerId,
      poolId,
    ),
    enabled: !deletionNotice,
    refetchInterval: ({ state }) =>
      !deletionNotice && !state.error && state.data?.some(isOctaviaProvisioning)
        ? 5_000
        : false,
  });
  const redirectsUnavailable =
    redirectPolicies.isError || redirectPolicies.isPaused;
  const l7Policies = redirectPolicies.isFetching
    ? undefined
    : redirectsUnavailable
      ? null
      : (redirectPolicies.data ?? null);
  const canChangeMembers =
    canChangePoolChildren &&
    members !== null &&
    canChangeOctaviaPoolMembers(pool);
  const monitorType = healthMonitorTypeForPool(pool);
  const monitorSource =
    healthMonitor && readHealthMonitorSettings(healthMonitor);
  const invalidatePoolData = (deleted = false) => {
    void queryClient.invalidateQueries({
      queryKey: loadBalancerDetailsQueryOptions(
        regionId,
        projectId,
        loadBalancerId,
      ).queryKey,
      refetchType: deleted ? "none" : "active",
    });
    void queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "project-quotas", "load-balancing"],
    });
  };
  const refreshPoolData = () => invalidatePoolData();
  const openAction = (next: PoolDetailAction) => {
    setNotice(null);
    if (
      next.kind === "pool" &&
      next.target.action === "delete" &&
      !octaviaPoolDeletionBlock(next.target.pool, [])
    ) {
      void redirectPolicies.refetch();
    }
    setAction(next);
  };
  const openMemberAction = (target: MemberDialogAction) => {
    openAction({ kind: "member", target });
  };
  const openMonitorAction = (target: HealthMonitorDialogAction) => {
    openAction({ kind: "monitor", target });
  };
  const onSuccess = (message: string) => {
    setAction(null);
    setNotice({ message, at: Date.now() });
    refreshPoolData();
  };

  if (deletionNotice) {
    return (
      <MutationAlert variant="success">
        {deletionNotice}{" "}
        <ResourceLink href={parentHref}>Return to pools</ResourceLink>
      </MutationAlert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="size-5 shrink-0 text-muted-foreground" />
            <h1 className="wrap-anywhere text-2xl font-semibold">
              {pool.name || "Unnamed pool"}
            </h1>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="wrap-anywhere font-mono text-sm">{pool.id}</span>
            <CopyButton value={pool.id} label="Copy pool ID" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {writesSupported ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!canChangePool}
                onClick={() =>
                  openAction({ kind: "pool", target: { action: "edit", pool } })
                }
              >
                <Pencil className="size-4" /> Edit pool
              </Button>
              <Button
                type="button"
                variant="outline"
                tone="danger"
                disabled={!canChangePool}
                onClick={() =>
                  openAction({
                    kind: "pool",
                    target: { action: "delete", pool },
                  })
                }
              >
                <Trash2 className="size-4" /> Delete pool
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            loading={isFetching || redirectPolicies.isFetching}
            onClick={refreshPoolData}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {isRefetchError ? (
        <MutationAlert variant="warning">
          Pool details could not be refreshed. The last loaded data is shown.
        </MutationAlert>
      ) : null}
      {notice ? (
        <MutationAlert variant="success">{notice.message}</MutationAlert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Pool">
          <DetailField label="Load balancer">
            <ResourceLink href={parentHref}>
              {loadBalancer.name || loadBalancer.id}
            </ResourceLink>
          </DetailField>
          <DetailField label="Protocol">{pool.protocol}</DetailField>
          <DetailField label="Algorithm">
            {formatPoolAlgorithm(pool.lb_algorithm)}
          </DetailField>
          <DetailField label="Session persistence">
            {persistence
              ? formatPoolPersistence(persistence.type)
              : persistence === null
                ? "None"
                : "Unavailable"}
          </DetailField>
          {persistence?.cookie_name ? (
            <DetailField label="Cookie name" className="font-mono">
              {persistence.cookie_name}
            </DetailField>
          ) : null}
          {pool.protocol === "HTTP" || pool.tls_enabled === true ? (
            <>
              <DetailField label="Backend TLS">
                {pool.tls_enabled === true
                  ? "Enabled"
                  : pool.tls_enabled === false
                    ? "Disabled"
                    : "Not reported"}
              </DetailField>
              {pool.tls_enabled === true || pool.ca_tls_container_ref ? (
                <DetailField label="Member CA certificate">
                  {memberCaId ? (
                    <ResourceLink
                      href={`/key-manager/secrets/${memberCaId}`}
                      className="wrap-anywhere font-mono"
                    >
                      {memberCaId}
                    </ResourceLink>
                  ) : pool.ca_tls_container_ref ? (
                    "External certificate reference"
                  ) : pool.ca_tls_container_ref === null ? (
                    "None (member certificates are not verified)"
                  ) : (
                    "Not reported"
                  )}
                </DetailField>
              ) : null}
              {pool.tls_container_ref ? (
                <DetailField label="Backend client certificate">
                  Configured
                </DetailField>
              ) : null}
              {pool.crl_container_ref ? (
                <DetailField label="Backend certificate revocation list">
                  Configured
                </DetailField>
              ) : null}
            </>
          ) : null}
          <DetailField label="Operating status">
            <Status status={pool.operating_status} />
          </DetailField>
          <DetailField label="Provisioning status">
            <Status status={pool.provisioning_status} />
          </DetailField>
          <DetailField label="Administrative state">
            {pool.admin_state_up ? "Up" : "Down"}
          </DetailField>
          <DetailField label="Listeners">
            {listeners.length ? (
              <ul className="space-y-1">
                {listeners.map((listener) =>
                  listener ? (
                    <li key={listener.id}>
                      <ResourceLink
                        href={loadBalancerListenerPath(
                          loadBalancer.id,
                          listener.id,
                        )}
                      >
                        {listener.name || listener.id}
                      </ResourceLink>
                    </li>
                  ) : null,
                )}
                {listeners.some((listener) => listener === null) ? (
                  <li className="text-muted-foreground">
                    Some listener details are unavailable.
                  </li>
                ) : null}
              </ul>
            ) : Array.isArray(pool.listeners) ? (
              "None attached"
            ) : (
              "Not reported"
            )}
          </DetailField>
          <DetailField label="Description">
            {pool.description || "-"}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(pool.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(pool.updated_at)}
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Health monitor"
          actions={
            writesSupported && monitorType ? (
              healthMonitor ? (
                healthMonitor.id === pool.healthmonitor_id &&
                healthMonitor.type === monitorType ? (
                  <div className="flex items-center gap-1">
                    <EditActionButton
                      type="button"
                      compact
                      label="Edit health monitor"
                      disabled={
                        !canChangePoolChildren ||
                        !monitorSource ||
                        !canChangeHealthMonitor(pool, healthMonitor)
                      }
                      onClick={() => {
                        if (monitorSource)
                          openMonitorAction({
                            action: "edit",
                            pool,
                            monitor: healthMonitor,
                            source: monitorSource,
                          });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      tone="danger"
                      size="icon-sm"
                      aria-label="Delete health monitor"
                      title="Delete health monitor"
                      disabled={
                        !canChangePoolChildren ||
                        !canChangeHealthMonitor(pool, healthMonitor, true)
                      }
                      onClick={() =>
                        openMonitorAction({
                          action: "delete",
                          pool,
                          monitor: healthMonitor,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null
              ) : pool.healthmonitor_id == null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !canChangePoolChildren || !canChangeHealthMonitor(pool)
                  }
                  onClick={() =>
                    openMonitorAction({
                      action: "create",
                      pool,
                      type: monitorType,
                    })
                  }
                >
                  <Plus className="size-4" /> Add health monitor
                </Button>
              ) : null
            ) : null
          }
        >
          {healthMonitor ? (
            <>
              <DetailField label="Name">
                {healthMonitor.name || "-"}
              </DetailField>
              <DetailField label="ID">
                <span className="font-mono">{healthMonitor.id}</span>{" "}
                <CopyButton
                  value={healthMonitor.id}
                  label="Copy health monitor ID"
                />
              </DetailField>
              <DetailField label="Type">{healthMonitor.type}</DetailField>
              <DetailField label="Operating status">
                <Status status={healthMonitor.operating_status} />
              </DetailField>
              <DetailField label="Provisioning status">
                <Status status={healthMonitor.provisioning_status} />
              </DetailField>
              <DetailField label="Administrative state">
                {healthMonitor.admin_state_up ? "Up" : "Down"}
              </DetailField>
              <DetailField label="Interval">
                {healthMonitor.delay} s
              </DetailField>
              <DetailField label="Timeout">
                {healthMonitor.timeout} s
              </DetailField>
              <DetailField label="Success threshold">
                {healthMonitor.max_retries}
              </DetailField>
              <DetailField label="Failure threshold">
                {healthMonitor.max_retries_down}
              </DetailField>
              {healthMonitor.http_method ? (
                <DetailField label="HTTP method">
                  {healthMonitor.http_method}
                </DetailField>
              ) : null}
              {typeof healthMonitor.http_version === "number" ? (
                <DetailField label="HTTP version">
                  HTTP/{healthMonitor.http_version.toFixed(1)}
                </DetailField>
              ) : null}
              {healthMonitor.domain_name ? (
                <DetailField label="Host header">
                  {healthMonitor.domain_name}
                </DetailField>
              ) : null}
              {healthMonitor.url_path ? (
                <DetailField label="URL path">
                  {healthMonitor.url_path}
                </DetailField>
              ) : null}
              {healthMonitor.expected_codes ? (
                <DetailField label="Expected codes">
                  {healthMonitor.expected_codes}
                </DetailField>
              ) : null}
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {pool.healthmonitor_id
                ? "Health monitor details are unavailable."
                : "No health monitor configured."}
            </p>
          )}
        </DetailSection>
      </div>

      <DetailSection title="L7 redirects">
        {redirectsUnavailable ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {redirectPolicies.data
              ? "L7 redirects could not be refreshed. The last loaded data is shown."
              : "L7 redirects are unavailable."}
          </p>
        ) : null}
        {redirectPolicies.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Listener</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Provisioning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {redirectPolicies.data.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    {policy.name || policy.id}
                  </TableCell>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    {policy.listener ? (
                      <ResourceLink
                        href={`${loadBalancerListenerPath(loadBalancer.id, policy.listener.id)}#l7-policies`}
                      >
                        {policy.listener.name || policy.listener.id}
                      </ResourceLink>
                    ) : (
                      policy.listener_id || "Unavailable"
                    )}
                  </TableCell>
                  <TableCell>{policy.position ?? "-"}</TableCell>
                  <TableCell>
                    {policy.admin_state_up === true
                      ? "Enabled"
                      : policy.admin_state_up === false
                        ? "Disabled"
                        : "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Status status={policy.provisioning_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : !redirectsUnavailable ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {redirectPolicies.data
              ? "No L7 policies target this pool."
              : "Loading L7 redirects"}
          </p>
        ) : null}
      </DetailSection>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Members</h2>
          {writesSupported ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canChangeMembers}
              onClick={() => openMemberAction({ action: "create", pool })}
            >
              <UserPlus className="size-4" /> Add member
            </Button>
          ) : null}
        </div>
        {members?.length ? (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Weight</TableHead>
                  {backupMembersSupported ? <TableHead>Role</TableHead> : null}
                  <TableHead>Operating</TableHead>
                  <TableHead>Provisioning</TableHead>
                  <TableHead>Administrative state</TableHead>
                  {writesSupported ? (
                    <TableHead className="text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name || member.id}</TableCell>
                    <TableCell>
                      <MemberEndpoint member={member} />
                    </TableCell>
                    <TableCell>{member.weight ?? "-"}</TableCell>
                    {backupMembersSupported ? (
                      <TableCell>
                        {formatOctaviaMemberRole(member.backup)}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Status status={member.operating_status} />
                    </TableCell>
                    <TableCell>
                      <Status status={member.provisioning_status} />
                    </TableCell>
                    <TableCell>
                      {member.admin_state_up ? "Up" : "Down"}
                    </TableCell>
                    {writesSupported ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <EditActionButton
                            type="button"
                            compact
                            label={`Edit member ${member.name || member.id}`}
                            disabled={
                              !canChangeMembers ||
                              !canChangeOctaviaListener(member)
                            }
                            onClick={() =>
                              openMemberAction({ action: "edit", member, pool })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            tone="danger"
                            size="icon-sm"
                            aria-label={`Remove member ${member.name || member.id}`}
                            title="Remove pool member"
                            disabled={
                              !canChangeMembers ||
                              !canChangeOctaviaListener(member)
                            }
                            onClick={() =>
                              openMemberAction({
                                action: "delete",
                                member,
                                pool,
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {members === null
              ? "Member details are unavailable."
              : "No members configured."}
          </p>
        )}
      </section>
      {action?.kind === "pool" ? (
        <PoolMutationDialog
          {...(action.target.action === "delete"
            ? { target: action.target, l7Policies }
            : { target: action.target })}
          loadBalancerId={loadBalancerId}
          backendTlsSupported={backendTlsSupported && writesSupported}
          scope={{ projectId, regionId }}
          onClose={() => setAction(null)}
          onRefresh={refreshPoolData}
          onSuccess={(message) => {
            if (action.target.action === "edit") {
              onSuccess(message);
              return;
            }
            setAction(null);
            setDeletionNotice(message);
            invalidatePoolData(true);
            router.replace(parentHref);
          }}
        />
      ) : null}
      {action?.kind === "member" ? (
        <MemberMutationDialog
          target={action.target}
          loadBalancerId={loadBalancerId}
          scope={{ projectId, regionId }}
          neutronAvailable={neutronAvailable}
          backupMembersSupported={backupMembersSupported}
          onClose={() => setAction(null)}
          onRefresh={refreshPoolData}
          onSuccess={onSuccess}
        />
      ) : null}
      {action?.kind === "monitor" ? (
        <HealthMonitorMutationDialog
          target={action.target}
          httpOptionsSupported={httpMonitorOptionsSupported}
          loadBalancerId={loadBalancerId}
          scope={{ projectId, regionId }}
          onClose={() => setAction(null)}
          onRefresh={refreshPoolData}
          onSuccess={onSuccess}
        />
      ) : null}
    </div>
  );
}
