"use client";

import { useState } from "react";
import { Ellipsis, Pencil, Play, Plus, Pause, Trash2 } from "lucide-react";
import {
  L7PolicyDialog,
  type L7DialogTarget,
} from "@/components/LoadBalancer/L7PolicyDialog";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ProgressStatusBadge } from "@/components/resources/ProgressStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MutationScope } from "@/lib/mutations";
import {
  canChangeOctaviaListeners,
  formatOctaviaStatus,
  isOctaviaProvisioning,
  octaviaStatusVariant,
} from "@/lib/openstack/octavia";
import {
  isL7HttpListener,
  isL7HttpPool,
  l7PolicyRuleIds,
  readL7Path,
  readL7PoolPolicy,
} from "@/lib/openstack/octavia-l7-settings";
import type { OctaviaLoadBalancerDetails } from "@/types/openstack";

export function L7PolicyPanel({
  data,
  supportsChanges,
  busy,
  scope,
  onChanged,
}: {
  data: Pick<
    OctaviaLoadBalancerDetails,
    "loadBalancer" | "listeners" | "pools" | "l7Policies" | "l7Rules"
  >;
  supportsChanges: boolean;
  busy: boolean;
  scope: MutationScope;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<L7DialogTarget | null>(null);
  const [notice, setNotice] = useState("");
  const { loadBalancer, listeners, pools, l7Policies, l7Rules } = data;
  const listenerById = new Map(
    listeners.map((listener) => [listener.id, listener]),
  );
  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  const httpListeners = listeners.filter(isL7HttpListener);
  const listenerChoices = httpListeners.filter(canChangeOctaviaListeners);
  const poolChoices = pools.filter(isL7HttpPool);
  const showCreate = supportsChanges && httpListeners.length > 0;
  const open = (next: L7DialogTarget) => {
    setNotice("");
    setTarget(next);
  };
  if (!showCreate && !l7Policies.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">L7 policies</h2>
          <Badge variant="outline">{l7Policies.length}</Badge>
        </div>
        {showCreate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !poolChoices.length || !listenerChoices.length}
            title={!poolChoices.length ? "No Active HTTP pools" : undefined}
            onClick={() => open({ action: "create-policy" })}
          >
            <Plus className="size-4" />
            Create routing policy
          </Button>
        ) : null}
      </div>
      {notice ? (
        <MutationAlert variant="success">{notice}</MutationAlert>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Listener</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Provisioning</TableHead>
              {supportsChanges ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!l7Policies.length ? (
              <TableRow>
                <TableCell
                  colSpan={supportsChanges ? 9 : 8}
                  className="py-8 text-center text-muted-foreground"
                >
                  No L7 policies are configured.
                </TableCell>
              </TableRow>
            ) : null}
            {l7Policies
              .toSorted(
                (a, b) =>
                  a.listener_id.localeCompare(b.listener_id) ||
                  a.position - b.position,
              )
              .map((policy) => {
                const listener = listenerById.get(policy.listener_id);
                const pool = policy.redirect_pool_id
                  ? poolById.get(policy.redirect_pool_id)
                  : undefined;
                const rules = l7Rules.filter(
                  (rule) => rule.l7policy_id === policy.id,
                );
                const rule = rules[0];
                const ruleIds = l7PolicyRuleIds(policy);
                const current = readL7PoolPolicy(policy);
                const path = rule && readL7Path(rule);
                const ruleSnapshot =
                  rule && path ? { id: rule.id, settings: path } : undefined;
                const ruleRefsMatch =
                  ruleIds?.length === rules.length &&
                  (!ruleIds.length ||
                    (ruleIds.length === 1 &&
                      ruleIds[0] === rule?.id &&
                      Boolean(ruleSnapshot)));
                const manageable =
                  supportsChanges &&
                  listener &&
                  isL7HttpListener(listener) &&
                  current &&
                  ruleRefsMatch &&
                  typeof policy.admin_state_up === "boolean";
                const ready =
                  !busy &&
                  Boolean(listener && canChangeOctaviaListeners(listener));
                const active = policy.provisioning_status === "ACTIVE";
                const disabledPolicy = policy.admin_state_up === false;
                const ruleActive = Boolean(
                  rule && canChangeOctaviaListeners(rule),
                );
                const label = policy.name || policy.id;
                const listenerId = policy.listener_id;
                const policyId = policy.id;
                return (
                  <TableRow key={policy.id}>
                    <TableCell className="max-w-36 whitespace-normal wrap-anywhere">
                      {listener?.name || listenerId}
                    </TableCell>
                    <TableCell>{policy.position}</TableCell>
                    <TableCell
                      className="max-w-36 whitespace-normal wrap-anywhere"
                      title={policy.description}
                    >
                      {label}
                    </TableCell>
                    <TableCell>{formatOctaviaStatus(policy.action)}</TableCell>
                    <TableCell className="max-w-36 whitespace-normal wrap-anywhere">
                      {pool?.name ||
                        policy.redirect_pool_id ||
                        policy.redirect_url ||
                        policy.redirect_prefix ||
                        "-"}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal wrap-anywhere">
                      {rules.length
                        ? rules.map((item) => (
                            <div key={item.id}>
                              {formatOctaviaStatus(item.type)}{" "}
                              {item.invert ? "not " : ""}
                              {formatOctaviaStatus(item.compare_type)}{" "}
                              {item.key ? (
                                <span className="font-mono">{item.key}: </span>
                              ) : null}
                              <span className="font-mono">{item.value}</span>
                              {!item.admin_state_up ? " (disabled)" : ""}
                              {isOctaviaProvisioning(item) ? " (pending)" : ""}
                            </div>
                          ))
                        : ruleIds?.length
                          ? "Unavailable"
                          : "No rules"}
                    </TableCell>
                    <TableCell>
                      {policy.admin_state_up ? "Enabled" : "Disabled"}
                    </TableCell>
                    <TableCell>
                      {isOctaviaProvisioning(policy) ? (
                        <ProgressStatusBadge
                          label={formatOctaviaStatus(
                            policy.provisioning_status,
                          )}
                        />
                      ) : (
                        <Badge
                          variant={octaviaStatusVariant(
                            policy.provisioning_status,
                          )}
                        >
                          {formatOctaviaStatus(policy.provisioning_status)}
                        </Badge>
                      )}
                    </TableCell>
                    {supportsChanges ? (
                      <TableCell className="text-right">
                        {manageable ? (
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Routing policy actions"
                                aria-label={`Actions for ${label}`}
                                disabled={
                                  !ready ||
                                  (!active &&
                                    policy.provisioning_status !== "ERROR")
                                }
                              >
                                <Ellipsis className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {disabledPolicy ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={
                                      !active ||
                                      !poolChoices.length ||
                                      (Boolean(rule) && !ruleActive)
                                    }
                                    onSelect={() =>
                                      open({
                                        action: "edit-policy",
                                        listenerId,
                                        policyId,
                                        source: current,
                                      })
                                    }
                                  >
                                    <Pencil /> Edit policy
                                  </DropdownMenuItem>
                                  {ruleSnapshot ? (
                                    <>
                                      <DropdownMenuItem
                                        disabled={!active || !ruleActive}
                                        onSelect={() =>
                                          open({
                                            action: "edit-rule",
                                            label,
                                            listenerId,
                                            policyId,
                                            sourceRule: ruleSnapshot,
                                          })
                                        }
                                      >
                                        <Pencil /> Edit path rule
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        disabled={
                                          !active ||
                                          (!ruleActive &&
                                            rule.provisioning_status !==
                                              "ERROR")
                                        }
                                        onSelect={() =>
                                          open({
                                            action: "confirm",
                                            label,
                                            listenerId,
                                            input: {
                                              action: "delete-rule",
                                              policyId,
                                              sourceRule: ruleSnapshot,
                                            },
                                          })
                                        }
                                      >
                                        <Trash2 /> Delete path rule
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem
                                        disabled={!active}
                                        onSelect={() =>
                                          open({
                                            action: "add-rule",
                                            label,
                                            listenerId,
                                            policyId,
                                          })
                                        }
                                      >
                                        <Plus /> Add path rule
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() =>
                                          open({
                                            action: "confirm",
                                            label,
                                            listenerId,
                                            input: {
                                              action: "delete-policy",
                                              policyId,
                                            },
                                          })
                                        }
                                      >
                                        <Trash2 /> Delete policy
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              ) : null}
                              {ruleSnapshot ? (
                                <DropdownMenuItem
                                  disabled={
                                    !active ||
                                    !ruleActive ||
                                    (disabledPolicy &&
                                      (!pool || !isL7HttpPool(pool)))
                                  }
                                  onSelect={() =>
                                    open({
                                      action: "confirm",
                                      label,
                                      listenerId,
                                      input: {
                                        action: "set-enabled",
                                        policyId,
                                        enabled: disabledPolicy,
                                        poolId: current.redirect_pool_id,
                                        sourceRule: ruleSnapshot,
                                      },
                                    })
                                  }
                                >
                                  {disabledPolicy ? <Play /> : <Pause />}
                                  {disabledPolicy
                                    ? "Enable policy"
                                    : "Disable policy"}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {target ? (
        <L7PolicyDialog
          target={target}
          scope={scope}
          loadBalancerId={loadBalancer.id}
          listeners={listenerChoices}
          pools={poolChoices}
          onClose={() => setTarget(null)}
          onSuccess={(message) => {
            setTarget(null);
            setNotice(message);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
