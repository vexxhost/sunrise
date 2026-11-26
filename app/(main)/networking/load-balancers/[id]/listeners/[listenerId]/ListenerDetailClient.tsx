"use client";

import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Network, Pencil } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { ListenerMutationDialog } from "@/components/LoadBalancer/ListenerMutationDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  loadBalancerDetailsQueryOptions,
  loadBalancerListenerDetailsQueryOptions,
  loadBalancerPoolChoicesQueryOptions,
} from "@/hooks/queries/useLoadBalancers";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  formatOctaviaStatus,
  isOctaviaProvisioning,
  loadBalancerPoolPath,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
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
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
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
    data: { loadBalancer, listener, capabilities },
    isRefetchError,
  } = useSuspenseQuery({
    ...query,
    refetchInterval: ({ state }) =>
      !state.error &&
      ((notice && Date.now() - notice.at < 20_000) ||
        (state.data &&
          (isOctaviaProvisioning(state.data.listener) ||
            isOctaviaProvisioning(state.data.loadBalancer))))
        ? 5_000
        : false,
  });
  const insertedHeaders = readListenerInsertHeaders(listener.insert_headers);
  const defaultPoolId = listener.default_pool_id;
  const { data: pools } = useQuery({
    ...loadBalancerPoolChoicesQueryOptions(regionId, projectId, loadBalancerId),
    enabled: Boolean(defaultPoolId),
  });
  const defaultPool = pools?.find(({ id }) => id === defaultPoolId);
  const headers = insertedHeaders
    ? Object.entries(insertedHeaders).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const canEdit =
    !isRefetchError &&
    canChangeOctaviaListeners(loadBalancer) &&
    canChangeOctaviaListener(listener);

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
        <Button
          variant="outline"
          disabled={!canEdit}
          onClick={() => {
            setNotice(null);
            setEditing(true);
          }}
        >
          <Pencil className="size-4" />
          Edit listener
        </Button>
      </div>

      {isRefetchError ? (
        <MutationAlert variant="warning">
          Listener settings could not be refreshed. Reload the page before
          editing.
        </MutationAlert>
      ) : null}
      {notice ? (
        <MutationAlert variant="success">{notice.message}</MutationAlert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Listener">
          <DetailField label="Load balancer">
            <ResourceLink
              href={`/networking/load-balancers/${encodeURIComponent(loadBalancer.id)}#listeners`}
            >
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

      {editing ? (
        <ListenerMutationDialog
          target={{ action: "edit", listener }}
          loadBalancer={loadBalancer}
          capabilities={capabilities}
          scope={{ projectId, regionId }}
          onClose={() => setEditing(false)}
          onSuccess={(message) => {
            setNotice({ message, at: Date.now() });
            setEditing(false);
            void queryClient.invalidateQueries({
              queryKey: loadBalancerDetailsQueryOptions(
                regionId,
                projectId,
                loadBalancerId,
              ).queryKey,
            });
          }}
        />
      ) : null}
    </div>
  );
}
