"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Layers, RefreshCw } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { MutationAlert } from "@/components/mutations/MutationAlert";
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
import { loadBalancerPoolDetailsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import {
  formatOctaviaStatus,
  isOctaviaProvisioning,
  loadBalancerListenerPath,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import {
  formatOctaviaMemberAddress,
  formatPoolAlgorithm,
  formatPoolPersistence,
  readPoolPersistence,
} from "@/lib/openstack/octavia-pool-settings";
import { formatUtcTimestamp } from "@/lib/openstack/time";

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
  poolId,
  projectId,
  regionId,
}: {
  loadBalancerId: string;
  poolId: string;
  projectId: string;
  regionId: string;
}) {
  const { data, isFetching, isRefetchError, refetch } = useSuspenseQuery({
    ...loadBalancerPoolDetailsQueryOptions(
      regionId,
      projectId,
      loadBalancerId,
      poolId,
    ),
    refetchInterval: ({ state }) => {
      const details = state.data;
      if (state.error || !details) return false;
      const resources = [
        details.loadBalancer,
        details.pool,
        ...(details.members ?? []),
        ...(details.healthMonitor ? [details.healthMonitor] : []),
      ];
      return resources.some(isOctaviaProvisioning) ? 5_000 : false;
    },
  });
  const { loadBalancer, pool, healthMonitor, members, listeners } = data;
  const persistence = readPoolPersistence(pool.session_persistence);
  const parentHref = `/networking/load-balancers/${encodeURIComponent(loadBalancer.id)}#pools`;

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
        <Button
          variant="outline"
          loading={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>

      {isRefetchError ? (
        <MutationAlert variant="warning">
          Pool details could not be refreshed. The last loaded data is shown.
        </MutationAlert>
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

        <DetailSection title="Health monitor">
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        {members?.length ? (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Operating</TableHead>
                  <TableHead>Provisioning</TableHead>
                  <TableHead>Administrative state</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name || member.id}</TableCell>
                    <TableCell className="font-mono">
                      {formatOctaviaMemberAddress(member)}
                    </TableCell>
                    <TableCell>{member.weight ?? "-"}</TableCell>
                    <TableCell>
                      <Status status={member.operating_status} />
                    </TableCell>
                    <TableCell>
                      <Status status={member.provisioning_status} />
                    </TableCell>
                    <TableCell>
                      {member.admin_state_up ? "Up" : "Down"}
                    </TableCell>
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
    </div>
  );
}
