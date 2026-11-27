"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { MutationScope } from "@/lib/mutations";
import {
  mutateOctaviaL7Action,
  type OctaviaL7Mutation,
} from "@/lib/openstack/octavia-l7-actions";
import {
  L7_HOST_VALUE_MAX_LENGTH,
  L7_PATH_MAX_LENGTH,
  l7PoolPolicySchema,
  l7RuleSettingsSchema,
  sameL7PoolPolicy,
  sameL7RuleSettings,
  type L7PoolPolicySettings,
  type L7RuleSettings,
  type L7RoutingPool,
} from "@/lib/openstack/octavia-l7-settings";
import type { OctaviaListener } from "@/types/openstack";

type ConfirmationInput = Extract<
  OctaviaL7Mutation,
  {
    action:
      "set-enabled" | "delete-policy" | "delete-failed-policy" | "delete-rule";
  }
>;
type RuleSnapshot = Extract<
  OctaviaL7Mutation,
  { action: "edit-rule" }
>["sourceRule"];

export type L7DialogTarget =
  | { action: "create-policy" }
  | {
      action: "edit-policy";
      listenerId: string;
      policyId: string;
      source: L7PoolPolicySettings;
      policyOrder?: string[];
    }
  | { action: "add-rule"; listenerId: string; policyId: string; label: string }
  | {
      action: "edit-rule";
      listenerId: string;
      policyId: string;
      label: string;
      sourceRule: RuleSnapshot;
    }
  | {
      action: "confirm";
      listenerId: string;
      label: string;
      input: ConfirmationInput;
    };

export function L7PolicyDialog({
  target,
  scope,
  loadBalancerId,
  listeners,
  listenerScoped = false,
  pools,
  onClose,
  onSuccess,
}: {
  target: L7DialogTarget;
  scope: MutationScope;
  loadBalancerId: string;
  listeners: OctaviaListener[];
  listenerScoped?: boolean;
  pools: L7RoutingPool[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [original] = useState(() => ({ scope, loadBalancerId, target }));
  const [listenerId, setListenerId] = useState(() =>
    "listenerId" in target
      ? target.listenerId
      : listeners.length === 1
        ? listeners[0].id
        : "",
  );
  const [policy, setPolicy] = useState<L7PoolPolicySettings>(() =>
    target.action === "edit-policy"
      ? target.source
      : { name: "", description: "", redirect_pool_id: "" },
  );
  const policyOrder =
    target.action === "edit-policy" ? target.policyOrder : undefined;
  const currentPosition =
    target.action === "edit-policy" && policyOrder
      ? policyOrder.indexOf(target.policyId) + 1
      : 0;
  const [position, setPosition] = useState(() => String(currentPosition));
  const [rule, setRule] = useState<L7RuleSettings>(() =>
    target.action === "edit-rule"
      ? target.sourceRule.settings
      : { type: "PATH", compare_type: "STARTS_WITH", value: "" },
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false);
  const creating =
    target.action === "create-policy" || target.action === "add-rule";
  const quota = useProjectQuotaImpact({
    enabled: creating,
    projectId: scope.projectId,
    regionId: scope.regionId,
    requests: [
      {
        metricId: target.action === "create-policy" ? "l7policy" : "l7rule",
        requested: 1,
      },
    ],
    serviceId: "load-balancing",
  });
  const close = () => {
    if (!inFlight.current && !pending) onClose();
  };
  const run = (input: OctaviaL7Mutation) => {
    if (inFlight.current || !listenerId) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mutateOctaviaL7Action(
          original.scope,
          original.loadBalancerId,
          listenerId,
          input,
        );
        if (result.ok) onSuccess(result.message);
        else setError(result.error.message);
      } catch {
        setError(
          "The result could not be confirmed. Refresh the load balancer before retrying.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };
  if (target.action === "confirm") {
    const { label, input } = target;
    const deleting = input.action !== "set-enabled";
    const command =
      input.action === "set-enabled"
        ? input.enabled
          ? "Enable routing policy"
          : "Disable routing policy"
        : input.action === "delete-policy"
          ? "Delete routing policy"
          : input.action === "delete-failed-policy"
            ? "Delete failed policy"
            : "Delete rule";
    const description =
      input.action === "set-enabled" ? (
        input.enabled ? (
          "Matching requests will be routed to the selected pool when the listener is enabled."
        ) : (
          "Matching requests will no longer be routed by this policy."
        )
      ) : input.action === "delete-policy" ? (
        "The disabled policy will be removed. Its listener and pool will remain."
      ) : input.action === "delete-failed-policy" ? (
        <>
          The failed policy
          {input.sourceRule ? (
            <>
              {" "}
              and its rule{" "}
              <code className="wrap-anywhere">
                {input.sourceRule.settings.value}
              </code>
            </>
          ) : null}{" "}
          will be permanently removed. Its listener and pool will remain.
        </>
      ) : (
        "The rule will be removed. The policy will stay disabled."
      );
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title={command + "?"}
        description={
          <>
            <span className="wrap-anywhere font-medium">{label}</span>:{" "}
            {description}
          </>
        }
        confirmLabel={command}
        variant={deleting ? "destructive" : "default"}
        pending={pending}
        error={error}
        onConfirm={() => run(input)}
      />
    );
  }
  const policyForm =
    target.action === "create-policy" || target.action === "edit-policy";
  const verb = creating ? (policyForm ? "Create" : "Add") : "Edit";
  const title = verb + (policyForm ? " routing policy" : " rule");
  const parsedPolicy = l7PoolPolicySchema.safeParse(policy);
  const parsedRule = l7RuleSettingsSchema.safeParse(rule);
  const matchingPool = pools.some(({ id }) => id === policy.redirect_pool_id);
  const matchingListener = listeners.some(({ id }) => id === listenerId);
  const nextPosition = Number(position);
  const validPosition =
    !policyOrder ||
    (Number.isInteger(nextPosition) &&
      nextPosition >= 1 &&
      nextPosition <= policyOrder.length);
  const orderChange =
    policyOrder && nextPosition !== currentPosition
      ? { before: policyOrder, position: nextPosition }
      : undefined;
  const changed =
    target.action === "edit-policy"
      ? Boolean(orderChange) || !sameL7PoolPolicy(policy, target.source)
      : target.action === "edit-rule"
        ? !sameL7RuleSettings(rule, target.sourceRule.settings)
        : true;
  const fieldError =
    !policyForm && attempted && !parsedRule.success
      ? parsedRule.error.issues[0]?.message
      : null;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {"label" in target
              ? target.label
              : target.action === "edit-policy"
                ? target.source.name || target.policyId
                : "HTTP routing to a pool. New policies start disabled."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (
              pending ||
              !changed ||
              !validPosition ||
              (creating && quota.issues.length)
            )
              return;
            if (policyForm && parsedPolicy.success && matchingPool) {
              if (target.action === "create-policy" && matchingListener) {
                run({ action: target.action, settings: parsedPolicy.data });
              } else if (target.action === "edit-policy") {
                run({
                  action: target.action,
                  policyId: target.policyId,
                  settings: parsedPolicy.data,
                  source: target.source,
                  ...(orderChange ? { order: orderChange } : {}),
                });
              }
            } else if (!policyForm && parsedRule.success) {
              if (target.action === "add-rule")
                run({
                  action: target.action,
                  policyId: target.policyId,
                  settings: parsedRule.data,
                });
              if (target.action === "edit-rule")
                run({
                  action: target.action,
                  policyId: target.policyId,
                  settings: parsedRule.data,
                  sourceRule: target.sourceRule,
                });
            }
          }}
        >
          {error || fieldError ? (
            <MutationAlert variant="error">{error || fieldError}</MutationAlert>
          ) : null}
          {policyForm ? (
            <>
              {target.action === "create-policy" && !listenerScoped ? (
                <div className="space-y-2">
                  <Label htmlFor="l7-listener">HTTP listener</Label>
                  <Select
                    value={listenerId}
                    onValueChange={setListenerId}
                    disabled={pending}
                  >
                    <SelectTrigger id="l7-listener" className="w-full">
                      <SelectValue placeholder="Select an HTTP listener" />
                    </SelectTrigger>
                    <SelectContent>
                      {listeners.map((listener) => (
                        <SelectItem key={listener.id} value={listener.id}>
                          {listener.name || listener.id} :
                          {listener.protocol_port}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="l7-policy-name">Name</Label>
                <Input
                  id="l7-policy-name"
                  value={policy.name}
                  maxLength={255}
                  disabled={pending}
                  onChange={(event) =>
                    setPolicy({ ...policy, name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="l7-policy-description">Description</Label>
                <Input
                  id="l7-policy-description"
                  value={policy.description}
                  maxLength={255}
                  disabled={pending}
                  onChange={(event) =>
                    setPolicy({ ...policy, description: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="l7-target-pool">Target pool</Label>
                <Select
                  value={policy.redirect_pool_id}
                  onValueChange={(id) =>
                    setPolicy({ ...policy, redirect_pool_id: id })
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="l7-target-pool" className="w-full">
                    <SelectValue placeholder="Select an HTTP pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.name || pool.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {policyOrder ? (
                <div className="space-y-2">
                  <Label htmlFor="l7-policy-position">Position</Label>
                  <Input
                    id="l7-policy-position"
                    type="number"
                    required
                    min={1}
                    max={policyOrder.length}
                    step={1}
                    value={position}
                    disabled={pending}
                    onChange={(event) => setPosition(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="l7-rule-type">Match field</Label>
                <Select
                  value={rule.type}
                  onValueChange={(type: L7RuleSettings["type"]) => {
                    setAttempted(false);
                    setRule(
                      type === "HOST_NAME"
                        ? { type, compare_type: "EQUAL_TO", value: "" }
                        : { type, compare_type: "STARTS_WITH", value: "" },
                    );
                  }}
                  disabled={pending || target.action === "edit-rule"}
                >
                  <SelectTrigger id="l7-rule-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PATH">Path</SelectItem>
                    <SelectItem value="HOST_NAME">Hostname</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="l7-rule-comparison">Comparison</Label>
                {rule.type === "PATH" ? (
                  <Select
                    value={rule.compare_type}
                    onValueChange={(compare_type: typeof rule.compare_type) =>
                      setRule({ ...rule, compare_type })
                    }
                    disabled={pending}
                  >
                    <SelectTrigger id="l7-rule-comparison" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STARTS_WITH">Starts with</SelectItem>
                      <SelectItem value="EQUAL_TO">Equals</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="l7-rule-comparison" value="Equals" readOnly />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="l7-rule-value">
                  {rule.type === "PATH" ? "Path" : "Host (optional port)"}
                </Label>
                <Input
                  id="l7-rule-value"
                  required
                  placeholder={
                    rule.type === "PATH" ? "/api/" : "app.example.test"
                  }
                  value={rule.value}
                  maxLength={
                    rule.type === "PATH"
                      ? L7_PATH_MAX_LENGTH
                      : L7_HOST_VALUE_MAX_LENGTH
                  }
                  className="font-mono"
                  disabled={pending}
                  onChange={(event) =>
                    setRule({ ...rule, value: event.target.value })
                  }
                />
              </div>
            </>
          )}
          {creating ? (
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
          ) : null}
          {creating && quota.issues.length ? (
            <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={
                !changed ||
                !validPosition ||
                (creating && quota.issues.length > 0) ||
                (policyForm &&
                  (!matchingPool ||
                    (target.action === "create-policy" && !matchingListener)))
              }
            >
              {creating ? <Plus /> : <Save />}
              {creating ? title : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
