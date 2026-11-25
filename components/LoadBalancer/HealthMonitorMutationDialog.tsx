"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  mutateOctaviaHealthMonitorAction,
  type OctaviaHealthMonitorMutation,
} from "@/lib/openstack/octavia-actions";
import {
  changedHealthMonitorFields,
  HEALTH_MONITOR_HTTP_METHODS,
  HEALTH_MONITOR_MAX_CODES,
  HEALTH_MONITOR_MAX_PATH,
  HEALTH_MONITOR_MAX_RETRIES,
  HEALTH_MONITOR_MAX_SECONDS,
  healthMonitorSettingsSchema,
  type HealthMonitorSettings,
} from "@/lib/openstack/octavia-health-monitor-settings";
import type { OctaviaHealthMonitor, OctaviaPool } from "@/types/openstack";

export type HealthMonitorDialogAction =
  | { action: "create"; pool: OctaviaPool; type: HealthMonitorSettings["type"] }
  | {
      action: "edit";
      pool: OctaviaPool;
      monitor: OctaviaHealthMonitor;
      source: HealthMonitorSettings;
    }
  | { action: "delete"; pool: OctaviaPool; monitor: OctaviaHealthMonitor };

const numericFields = [
  {
    key: "delay",
    label: "Interval (seconds)",
    max: HEALTH_MONITOR_MAX_SECONDS,
  },
  {
    key: "timeout",
    label: "Timeout (seconds)",
    max: HEALTH_MONITOR_MAX_SECONDS,
  },
  {
    key: "max_retries",
    label: "Success threshold",
    max: HEALTH_MONITOR_MAX_RETRIES,
  },
  {
    key: "max_retries_down",
    label: "Failure threshold",
    max: HEALTH_MONITOR_MAX_RETRIES,
  },
] as const;

function initialSettings(
  type: HealthMonitorSettings["type"],
): HealthMonitorSettings {
  const common = {
    name: "",
    admin_state_up: true,
    delay: 5,
    timeout: 3,
    max_retries: 3,
    max_retries_down: 3,
  };
  return type === "HTTP"
    ? {
        ...common,
        type,
        http_method: "GET",
        url_path: "/",
        expected_codes: "200",
      }
    : { ...common, type };
}

export function HealthMonitorMutationDialog({
  target,
  loadBalancerId,
  scope,
  onClose,
  onSuccess,
}: {
  target: HealthMonitorDialogAction;
  loadBalancerId: string;
  scope: MutationScope;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const creating = target.action === "create";
  const [original] = useState(() => ({ scope, loadBalancerId, target }));
  const [fields, setFields] = useState(() =>
    target.action === "edit"
      ? target.source
      : initialSettings(creating ? target.type : "TCP"),
  );
  const [numbers, setNumbers] = useState(() => ({
    delay: String(fields.delay),
    timeout: String(fields.timeout),
    max_retries: String(fields.max_retries),
    max_retries_down: String(fields.max_retries_down),
  }));
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const quota = useProjectQuotaImpact({
    enabled: creating,
    projectId: scope.projectId,
    regionId: scope.regionId,
    requests: [{ metricId: "healthmonitor", requested: 1 }],
    serviceId: "load-balancing",
  });
  const close = () => {
    if (!inFlight.current && !pending) onClose();
  };
  const run = (input: OctaviaHealthMonitorMutation) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mutateOctaviaHealthMonitorAction(
          original.scope,
          original.loadBalancerId,
          original.target.pool.id,
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
  if (original.target.action === "delete") {
    const { monitor, pool } = original.target;
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Delete health monitor?"
        description={
          <>
            Octavia will stop checking the health of members in{" "}
            <span className="wrap-anywhere font-medium">
              {pool.name || pool.id}
            </span>
            . The pool and its members will remain.
          </>
        }
        confirmLabel="Delete health monitor"
        pending={pending}
        variant="destructive"
        error={error}
        onConfirm={() => run({ action: "delete", id: monitor.id })}
      />
    );
  }
  const draft = {
    ...fields,
    delay: Number(numbers.delay),
    timeout: Number(numbers.timeout),
    max_retries: Number(numbers.max_retries),
    max_retries_down: Number(numbers.max_retries_down),
  };
  const validated = healthMonitorSettingsSchema.safeParse(draft);
  const hasChanges =
    original.target.action !== "edit" ||
    Object.keys(changedHealthMonitorFields(original.target.source, draft))
      .length > 0;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>
            {creating ? "Add health monitor" : "Edit health monitor"}
          </DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {original.target.pool.name || original.target.pool.id}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (
              pending ||
              !hasChanges ||
              !validated.success ||
              quota.issues.length
            )
              return;
            const target = original.target;
            if (target.action === "create")
              run({ action: "create", settings: validated.data });
            if (target.action === "edit")
              run({
                action: "edit",
                id: target.monitor.id,
                settings: validated.data,
                source: target.source,
              });
          }}
        >
          {error ? (
            <MutationAlert variant="error">{error}</MutationAlert>
          ) : null}
          {attempted && !validated.success ? (
            <MutationAlert variant="error">
              {validated.error.issues[0]?.message}
            </MutationAlert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="health-monitor-name">Name</Label>
              <Input
                id="health-monitor-name"
                value={fields.name}
                maxLength={255}
                onChange={(event) =>
                  setFields({ ...fields, name: event.target.value })
                }
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="health-monitor-type">Check type</Label>
              <Input id="health-monitor-type" value={fields.type} readOnly />
            </div>
            {numericFields.map(({ key, label, max }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`health-monitor-${key}`}>{label}</Label>
                <Input
                  id={`health-monitor-${key}`}
                  type="number"
                  required
                  min={1}
                  max={max}
                  step={1}
                  value={numbers[key]}
                  onChange={(event) =>
                    setNumbers({ ...numbers, [key]: event.target.value })
                  }
                  disabled={pending}
                />
              </div>
            ))}
          </div>
          {fields.type === "HTTP" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="health-monitor-method">HTTP method</Label>
                <Select
                  value={fields.http_method}
                  onValueChange={(value: typeof fields.http_method) =>
                    setFields({ ...fields, http_method: value })
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="health-monitor-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEALTH_MONITOR_HTTP_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="health-monitor-codes">
                  Expected status codes
                </Label>
                <Input
                  id="health-monitor-codes"
                  required
                  placeholder="200-204"
                  maxLength={HEALTH_MONITOR_MAX_CODES}
                  value={fields.expected_codes}
                  onChange={(event) =>
                    setFields({ ...fields, expected_codes: event.target.value })
                  }
                  disabled={pending}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="health-monitor-path">Request path</Label>
                <Input
                  id="health-monitor-path"
                  required
                  placeholder="/healthz"
                  maxLength={HEALTH_MONITOR_MAX_PATH}
                  value={fields.url_path}
                  onChange={(event) =>
                    setFields({ ...fields, url_path: event.target.value })
                  }
                  disabled={pending}
                />
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox
              id="health-monitor-admin"
              checked={fields.admin_state_up}
              onCheckedChange={(checked) =>
                setFields({ ...fields, admin_state_up: checked === true })
              }
              disabled={pending}
            />
            <Label htmlFor="health-monitor-admin">
              Administratively enabled
            </Label>
          </div>
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
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={!hasChanges || quota.issues.length > 0}
            >
              {creating ? <Plus /> : <Save />}
              {creating ? "Add health monitor" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
