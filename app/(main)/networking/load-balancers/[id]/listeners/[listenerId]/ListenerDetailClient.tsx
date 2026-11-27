"use client";

import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Network, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { L7PolicyPanel } from "@/components/LoadBalancer/L7PolicyPanel";
import {
  ListenerMutationDialog,
  type ListenerDialogAction,
} from "@/components/LoadBalancer/ListenerMutationDialog";
import { TrafficStatistics } from "@/components/LoadBalancer/TrafficStatistics";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  loadBalancerDetailsQueryOptions,
  loadBalancerListenerDetailsQueryOptions,
  loadBalancerListenerRoutingQueryOptions,
  loadBalancerPoolChoicesQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  formatOctaviaStatus,
  isOctaviaAmphoraProvider,
  isOctaviaProvisioning,
  loadBalancerPoolPath,
  octaviaStatusVariant,
  octaviaTopologyRefetchInterval,
} from "@/lib/openstack/octavia";
import { isL7HttpListener } from "@/lib/openstack/octavia-l7-settings";
import {
  LISTENER_NUMERIC_FIELDS,
  LISTENER_NUMERIC_KEYS,
  listenerSettingUnavailable,
  readListenerInsertHeaders,
} from "@/lib/openstack/octavia-listener-settings";
import { formatUtcTimestamp } from "@/lib/openstack/time";

export function ListenerDetailClient({
  loadBalancerId,
  listenerId,
  projectId,
  regionId,
}: {
  loadBalancerId: string;
  listenerId: string;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Exclude<
    ListenerDialogAction,
    { action: "create" }
  > | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null);
  const [routingChangedAt, setRoutingChangedAt] = useState<number>();
  const [notice, setNotice] = useState<{ message: string; at: number } | null>(
    null,
  );
  const query = loadBalancerListenerDetailsQueryOptions(
    regionId,
    projectId,
    loadBalancerId,
    listenerId,
  );
  const {
    data: { loadBalancer, listener, capabilities, stats },
    isFetching,
    isRefetchError,
  } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      deletionNotice
        ? false
        : octaviaTopologyRefetchInterval({
            changedAt: notice?.at ?? routingChangedAt,
            failed: Boolean(state.error),
            pending:
              state.data &&
              (isOctaviaProvisioning(state.data.listener) ||
                isOctaviaProvisioning(state.data.loadBalancer)),
          }),
  });
  const insertedHeaders = readListenerInsertHeaders(listener.insert_headers);
  const defaultPoolId = listener.default_pool_id;
  const supportsRoutingChanges =
    isOctaviaAmphoraProvider(loadBalancer.provider) &&
    isL7HttpListener(listener);
  const showRouting =
    supportsRoutingChanges || Boolean(listener.l7policies?.length);
  const routing = useQuery({
    ...loadBalancerListenerRoutingQueryOptions(
      regionId,
      projectId,
      loadBalancerId,
      listenerId,
    ),
    enabled: showRouting && !deletionNotice,
    refetchInterval: ({ state }) =>
      deletionNotice
        ? false
        : octaviaTopologyRefetchInterval({
            changedAt: routingChangedAt,
            failed: Boolean(state.error),
            pending:
              state.data?.l7Policies.some(isOctaviaProvisioning) ||
              state.data?.l7Rules.some(isOctaviaProvisioning),
          }),
  });
  const poolChoices = useQuery({
    ...loadBalancerPoolChoicesQueryOptions(regionId, projectId, loadBalancerId),
    enabled: (Boolean(defaultPoolId) || showRouting) && !deletionNotice,
    refetchInterval: ({ state }) =>
      !deletionNotice && !state.error && state.data?.some(isOctaviaProvisioning)
        ? 5_000
        : false,
  });
  const defaultPool = poolChoices.data?.find(({ id }) => id === defaultPoolId);
  const headers = insertedHeaders
    ? Object.entries(insertedHeaders).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const parentHref = `/networking/load-balancers/${encodeURIComponent(loadBalancer.id)}#listeners`;
  const canChange =
    !isFetching &&
    !isRefetchError &&
    Array.isArray(loadBalancer.listeners) &&
    loadBalancer.listeners.some((reference) => reference?.id === listener.id) &&
    canChangeOctaviaListeners(loadBalancer) &&
    canChangeOctaviaListener(listener);

  const openAction = (kind: "edit" | "delete") => {
    setNotice(null);
    setAction({ action: kind, listener });
  };

  const refreshTopology = (deleted = false) => {
    void queryClient.invalidateQueries({
      queryKey: loadBalancerDetailsQueryOptions(
        regionId,
        projectId,
        loadBalancerId,
      ).queryKey,
      refetchType: deleted ? "none" : "active",
    });
  };
  const refreshQuota = () => {
    void queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "project-quotas", "load-balancing"],
    });
  };
  const onSuccess = (message: string) => {
    const deleted = action?.action === "delete";
    setAction(null);
    refreshTopology(deleted);
    if (deleted) {
      setDeletionNotice(message);
      refreshQuota();
      router.replace(parentHref);
    } else {
      setNotice({ message, at: Date.now() });
    }
  };

  if (deletionNotice) {
    return (
      <MutationAlert variant="success">
        {deletionNotice}{" "}
        <ResourceLink href={parentHref}>Return to listeners</ResourceLink>
      </MutationAlert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Network className="size-5 shrink-0 text-muted-foreground" />
            <h1 className="wrap-anywhere text-2xl font-semibold">
              {listener.name || "Unnamed listener"}
            </h1>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="wrap-anywhere font-mono text-sm">
              {listener.id}
            </span>
            <CopyButton value={listener.id} label="Copy listener ID" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            loading={isFetching}
            onClick={() => refreshTopology()}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canChange}
            onClick={() => openAction("edit")}
          >
            <Pencil className="size-4" />
            Edit listener
          </Button>
          <Button
            type="button"
            variant="outline"
            tone="danger"
            disabled={!canChange}
            onClick={() => openAction("delete")}
          >
            <Trash2 className="size-4" />
            Delete listener
          </Button>
        </div>
      </div>

      {isRefetchError ? (
        <MutationAlert variant="warning">
          Listener details could not be refreshed. The last loaded data is
          shown.
        </MutationAlert>
      ) : null}
      {notice ? (
        <MutationAlert variant="success">{notice.message}</MutationAlert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Listener">
          <DetailField label="Load balancer">
            <ResourceLink href={parentHref}>
              {loadBalancer.name || loadBalancer.id}
            </ResourceLink>
          </DetailField>
          <DetailField label="Protocol">
            {listener.protocol === "HTTPS"
              ? "HTTPS passthrough"
              : listener.protocol === "TERMINATED_HTTPS"
                ? "Terminated HTTPS"
                : listener.protocol}
          </DetailField>
          <DetailField label="Port">{listener.protocol_port}</DetailField>
          <DetailField label="Operating status">
            <Badge variant={octaviaStatusVariant(listener.operating_status)}>
              {formatOctaviaStatus(listener.operating_status)}
            </Badge>
          </DetailField>
          <DetailField label="Provisioning status">
            {isOctaviaProvisioning(listener) ? (
              <ProgressStatusBadge
                label={formatOctaviaStatus(listener.provisioning_status)}
              />
            ) : (
              <Badge
                variant={octaviaStatusVariant(listener.provisioning_status)}
              >
                {formatOctaviaStatus(listener.provisioning_status)}
              </Badge>
            )}
          </DetailField>
          <DetailField label="Administrative state">
            {listener.admin_state_up ? "Up" : "Down"}
          </DetailField>
          <DetailField label="Default pool">
            {defaultPoolId ? (
              <ResourceLink
                href={loadBalancerPoolPath(loadBalancer.id, defaultPoolId)}
              >
                {defaultPool?.name || defaultPoolId}
              </ResourceLink>
            ) : defaultPoolId === null ? (
              "None"
            ) : (
              "Not reported"
            )}
          </DetailField>
          <DetailField label="Description">
            {listener.description || "-"}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {listener.project_id}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(listener.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(listener.updated_at)}
          </DetailField>
        </DetailSection>
        <DetailSection title="Advanced settings">
          {LISTENER_NUMERIC_KEYS.filter(
            (key) =>
              listener[key] !== undefined &&
              !listenerSettingUnavailable(
                key,
                loadBalancer,
                listener.protocol,
                capabilities,
              ),
          ).map((key) => (
            <DetailField label={LISTENER_NUMERIC_FIELDS[key].label} key={key}>
              {listener[key] === null ||
              (key === "connection_limit" && listener[key] === -1)
                ? "Cloud default"
                : listener[key]}
            </DetailField>
          ))}
          <DetailField label="Allowed CIDRs">
            {listener.allowed_cidrs?.length ? (
              <ul className="space-y-0.5 font-mono text-xs">
                {listener.allowed_cidrs.map((cidr) => (
                  <li key={cidr}>{cidr}</li>
                ))}
              </ul>
            ) : loadBalancer.vip_sg_ids?.length ? (
              "Controlled by VIP security groups"
            ) : listener.allowed_cidrs === undefined ? (
              "Not reported"
            ) : (
              "No allowlist"
            )}
          </DetailField>
          <DetailField label="Insert headers">
            {headers.length ? (
              <dl className="space-y-1">
                {headers.map(([name, value]) => (
                  <div key={name} className="flex flex-wrap gap-x-2">
                    <dt className="font-mono text-xs">{name}</dt>
                    <dd className="text-xs text-muted-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : insertedHeaders ? (
              "None"
            ) : (
              "Not reported"
            )}
          </DetailField>
        </DetailSection>
      </div>

      <TrafficStatistics stats={stats} />

      {showRouting ? (
        <>
          {routing.isError ? (
            <MutationAlert variant="warning">
              Listener routing policies could not be refreshed.
            </MutationAlert>
          ) : null}
          {routing.data ? (
            <L7PolicyPanel
              listenerScoped
              data={{
                loadBalancer,
                listeners: [listener],
                pools: poolChoices.isError ? [] : (poolChoices.data ?? []),
                ...routing.data,
              }}
              supportsChanges={supportsRoutingChanges}
              busy={
                !canChange ||
                routing.isFetching ||
                routing.isError ||
                poolChoices.isFetching
              }
              scope={{ projectId, regionId }}
              onChanged={() => {
                setNotice(null);
                setRoutingChangedAt(Date.now());
                refreshTopology();
                refreshQuota();
              }}
            />
          ) : !routing.isError ? (
            <DetailSection title="L7 policies">
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Loading routing policies
              </p>
            </DetailSection>
          ) : null}
        </>
      ) : null}

      {action ? (
        <ListenerMutationDialog
          target={action}
          loadBalancer={loadBalancer}
          capabilities={capabilities}
          scope={{ projectId, regionId }}
          onClose={() => setAction(null)}
          onSuccess={onSuccess}
        />
      ) : null}
    </div>
  );
}
