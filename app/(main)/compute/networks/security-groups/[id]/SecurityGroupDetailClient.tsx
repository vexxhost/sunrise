"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import {
  SecurityGroupDetailActions,
  SecurityGroupRuleActions,
} from "@/components/Network/SecurityGroupDetailActions";
import { Badge } from "@/components/ui/badge";
import {
  securityGroupQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";

function ports(rule: {
  port_range_min: number | null;
  port_range_max: number | null;
}) {
  if (!rule.port_range_min && !rule.port_range_max) return "Any";
  if (rule.port_range_min === rule.port_range_max)
    return String(rule.port_range_min);
  return `${rule.port_range_min ?? "Any"}-${rule.port_range_max ?? "Any"}`;
}

export function SecurityGroupDetailClient({
  id,
  projectId,
  regionId,
}: {
  id: string;
  projectId: string;
  regionId: string;
}) {
  const group = useSuspenseQuery(
    securityGroupQueryOptions(regionId, projectId, id),
  );
  const groups = useSuspenseQuery(
    securityGroupsQueryOptions(regionId, projectId),
  );
  const groupById = new Map(
    groups.data.map((candidate) => [candidate.id, candidate]),
  );
  const owned =
    group.data.project_id === projectId || group.data.tenant_id === projectId;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {group.data.name || group.data.id}
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {group.data.description || "No description"}
          </p>
        </div>
        {owned ? (
          <SecurityGroupDetailActions
            group={group.data}
            groups={groups.data}
            projectId={projectId}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Rules</h3>
          <Badge variant="outline">
            {group.data.security_group_rules.length}
          </Badge>
        </div>
        {group.data.security_group_rules.length ? (
          <div className="overflow-x-auto rounded-md border">
            <div className="grid min-w-[960px] grid-cols-[7rem_7rem_7rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_5rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Direction</span>
              <span>IP version</span>
              <span>Protocol</span>
              <span>Ports</span>
              <span>Remote</span>
              <span>Description</span>
              <span />
            </div>
            {group.data.security_group_rules.map((rule) => (
              <div
                key={rule.id}
                className="grid min-w-[960px] grid-cols-[7rem_7rem_7rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_5rem] items-center px-3 py-2.5 text-sm not-last:border-b"
              >
                <span className="capitalize">{rule.direction}</span>
                <span>{rule.ethertype}</span>
                <span className="uppercase">{rule.protocol || "Any"}</span>
                <span>{ports(rule)}</span>
                <span className="truncate font-mono text-xs">
                  {rule.remote_ip_prefix ||
                    (rule.remote_group_id
                      ? groupById.get(rule.remote_group_id)?.name
                      : null) ||
                    rule.remote_group_id ||
                    "Any"}
                </span>
                <span className="truncate text-muted-foreground">
                  {rule.description || "-"}
                </span>
                <span>
                  {owned ? (
                    <SecurityGroupRuleActions
                      groups={groups.data}
                      projectId={projectId}
                      regionId={regionId}
                      rule={rule}
                    />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No rules are defined in this security group.
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Metadata</h3>
        <div className="divide-y rounded-md border">
          {[
            ["ID", group.data.id],
            ["Project ID", group.data.project_id],
            ["Created", group.data.created_at],
            ["Updated", group.data.updated_at],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="break-words">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
