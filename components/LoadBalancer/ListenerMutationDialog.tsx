"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Save } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { loadBalancerPoolChoicesQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { MutationScope } from "@/lib/mutations";
import type { OpenStackServiceCapabilities } from "@/lib/openstack/capabilities";
import {
  mutateLoadBalancerListenerAction,
  type OctaviaListenerMutation,
} from "@/lib/openstack/octavia-actions";
import { octaviaListenerDeletionBlock } from "@/lib/openstack/octavia";
import {
  availableListenerProtocols,
  editableListenerInsertHeaders,
  isListenerInsertHeaderEnabled,
  LISTENER_NUMERIC_FIELDS,
  LISTENER_NUMERIC_KEYS,
  listenerCidrError,
  listenerSettingUnavailable,
  readListenerInsertHeaders,
  sameListenerCidrs,
  type ListenerNumericField,
  type OctaviaListenerProtocol,
  type OctaviaListenerSettings,
} from "@/lib/openstack/octavia-listener-settings";
import {
  canUseOctaviaPoolAsDefault,
  supportsOctaviaDefaultPoolChanges,
} from "@/lib/openstack/octavia-pool-settings";
import type { OctaviaListener, OctaviaLoadBalancer } from "@/types/openstack";

export type ListenerDialogAction =
  | { action: "create" }
  | { action: "edit" | "delete"; listener: OctaviaListener };

type ListenerHeaderChanges = NonNullable<
  Extract<OctaviaListenerMutation, { action: "edit" }>["insertHeaders"]
>;

const NO_DEFAULT_POOL = "none";

export function ListenerMutationDialog({
  target,
  loadBalancer,
  capabilities,
  scope,
  onClose,
  onSuccess,
}: {
  target: ListenerDialogAction;
  loadBalancer: OctaviaLoadBalancer;
  capabilities: OpenStackServiceCapabilities;
  scope: MutationScope;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const creating = target.action === "create";
  const listener = creating ? undefined : target.listener;
  const protocols = availableListenerProtocols(
    loadBalancer.provider,
    capabilities,
  );
  const originalCidrs =
    listener?.allowed_cidrs === null ? [] : listener?.allowed_cidrs;
  const [initial] = useState(() => ({
    loadBalancerId: loadBalancer.id,
    scope,
    name: listener?.name ?? "",
    description: listener?.description ?? "",
    adminStateUp: listener?.admin_state_up ?? true,
    listener,
    cidrs: originalCidrs,
  }));
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [adminStateUp, setAdminStateUp] = useState(initial.adminStateUp);
  const [protocol, setProtocol] = useState<OctaviaListenerProtocol>(
    protocols[0],
  );
  const [port, setPort] = useState("");
  const [numbers, setNumbers] = useState<
    Partial<Record<ListenerNumericField, string>>
  >({});
  const [cidrMode, setCidrMode] = useState<"any" | "restricted">(
    initial.cidrs?.length ? "restricted" : "any",
  );
  const [cidrText, setCidrText] = useState(initial.cidrs?.join("\n") ?? "");
  const [headerChoices, setHeaderChoices] = useState<
    Partial<Record<keyof ListenerHeaderChanges, boolean>>
  >({});
  const originalDefaultPoolId = initial.listener?.default_pool_id;
  const [defaultPoolId, setDefaultPoolId] = useState(originalDefaultPoolId);
  const defaultPoolSupported =
    target.action === "edit" &&
    supportsOctaviaDefaultPoolChanges(
      loadBalancer.provider,
      target.listener.protocol,
    );
  const canChooseDefaultPool =
    defaultPoolSupported && originalDefaultPoolId !== undefined;
  const poolQuery = useQuery({
    ...loadBalancerPoolChoicesQueryOptions(
      initial.scope.regionId,
      initial.scope.projectId,
      initial.loadBalancerId,
    ),
    enabled: canChooseDefaultPool,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const quota = useProjectQuotaImpact({
    enabled: creating,
    projectId: scope.projectId,
    regionId: scope.regionId,
    requests: [{ metricId: "listener", requested: 1 }],
    serviceId: "load-balancing",
  });
  const close = () => {
    if (!inFlight.current && !pending) onClose();
  };
  const run = (input: OctaviaListenerMutation) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mutateLoadBalancerListenerAction(
          initial.scope,
          initial.loadBalancerId,
          input,
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        onSuccess(result.message);
      } catch {
        setError(
          "The result could not be confirmed. Refresh the load balancer before retrying.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };

  if (target.action === "delete") {
    const blocked = octaviaListenerDeletionBlock(target.listener);
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        onConfirm={() => {
          if (!blocked) run({ action: "delete", id: target.listener.id });
        }}
        title="Delete listener?"
        description={
          <>
            <span className="wrap-anywhere font-medium">
              {target.listener.name || target.listener.id}
            </span>{" "}
            will stop accepting {target.listener.protocol} traffic on port{" "}
            {target.listener.protocol_port}.
          </>
        }
        confirmLabel="Delete listener"
        confirmDisabled={Boolean(blocked)}
        variant="destructive"
        pending={pending}
        error={error}
      >
        {blocked ? (
          <MutationAlert variant="warning">{blocked}</MutationAlert>
        ) : null}
      </MutationConfirmationDialog>
    );
  }

  const portNumber = Number(port);
  const validPort =
    /^\d+$/.test(port) && portNumber >= 1 && portNumber <= 65535;
  const activeProtocol = creating
    ? protocol
    : (initial.listener?.protocol ?? "");
  const poolChoices = poolQuery.isError
    ? []
    : (poolQuery.data ?? []).filter((pool) =>
        canUseOctaviaPoolAsDefault(
          pool,
          loadBalancer.provider,
          capabilities,
          activeProtocol,
        ),
      );
  const defaultPoolChange =
    canChooseDefaultPool &&
    defaultPoolId !== undefined &&
    defaultPoolId !== originalDefaultPoolId
      ? { before: originalDefaultPoolId, after: defaultPoolId }
      : undefined;
  const selectedPool = poolChoices.find(({ id }) => id === defaultPoolId);
  const originalPool = poolQuery.data?.find(
    ({ id }) => id === originalDefaultPoolId,
  );
  const numericKeys = LISTENER_NUMERIC_KEYS.filter(
    (key) =>
      !listenerSettingUnavailable(
        key,
        loadBalancer,
        activeProtocol,
        capabilities,
      ) &&
      (creating || initial.listener?.[key] !== undefined),
  );
  const cidrUnavailable =
    listenerSettingUnavailable(
      "allowed_cidrs",
      loadBalancer,
      activeProtocol,
      capabilities,
    ) ??
    (!creating && initial.cidrs === undefined
      ? "Octavia did not return the current CIDR allowlist."
      : null);
  const canClearCidrs =
    Boolean(initial.cidrs?.length) &&
    !listenerSettingUnavailable(
      "allowed_cidrs",
      loadBalancer,
      activeProtocol,
      capabilities,
      [],
    );
  const showCidrs = !cidrUnavailable || canClearCidrs;
  const settings: OctaviaListenerSettings = {};
  const sourceSettings: OctaviaListenerSettings = {};
  let settingsError: string | null = null;
  for (const key of numericKeys) {
    const draft = numbers[key];
    if (draft === undefined || (creating && !draft)) continue;
    const current = initial.listener?.[key];
    const field = LISTENER_NUMERIC_FIELDS[key];
    const value = draft ? Number(draft) : null;
    if (
      value !== null &&
      (!/^-?\d+$/.test(draft) || value < field.min || value > field.max)
    ) {
      settingsError ??=
        field.label +
        " must be a whole number from " +
        field.min +
        " to " +
        field.max +
        ".";
      continue;
    }
    if (value === current) continue;
    settings[key] = value;
    if (!creating) sourceSettings[key] = current;
  }
  if (showCidrs && (!cidrUnavailable || cidrMode === "any")) {
    const cidrs =
      cidrMode === "any"
        ? []
        : cidrText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
    if (cidrMode === "restricted" && !cidrs.length) {
      settingsError ??= "Enter at least one CIDR or choose Any source.";
    } else if (!sameListenerCidrs(cidrs, initial.cidrs ?? [])) {
      const error = listenerCidrError(cidrs, loadBalancer);
      if (error) settingsError ??= error;
      else {
        settings.allowed_cidrs = cidrs;
        if (!creating) sourceSettings.allowed_cidrs = initial.cidrs;
      }
    }
  }
  const initialHeaders =
    !creating && readListenerInsertHeaders(initial.listener?.insert_headers);
  const editableHeaders = initialHeaders
    ? editableListenerInsertHeaders(
        loadBalancer.provider,
        activeProtocol,
        capabilities,
      )
    : [];
  const insertHeaders: ListenerHeaderChanges = {};
  if (initialHeaders) {
    for (const header of editableHeaders) {
      const before = initialHeaders[header];
      const enabled = headerChoices[header];
      if (
        enabled !== undefined &&
        enabled !== isListenerInsertHeaderEnabled(before)
      ) {
        insertHeaders[header] = { before: before ?? null, enabled };
      }
    }
  }
  const advancedChanged = Object.keys(settings).length > 0;
  const headersChanged = Object.keys(insertHeaders).length > 0;
  const changed =
    name !== initial.name ||
    description !== initial.description ||
    adminStateUp !== initial.adminStateUp ||
    advancedChanged ||
    headersChanged ||
    defaultPoolChange !== undefined;
  const allowed =
    !settingsError &&
    (creating
      ? validPort && protocols.includes(protocol) && quota.issues.length === 0
      : changed &&
        (!defaultPoolChange ||
          defaultPoolChange.after === null ||
          Boolean(selectedPool)));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowed) return;
    const fields = {
      name,
      description,
      adminStateUp,
      ...(advancedChanged ? { settings } : {}),
    };
    if (target.action === "create") {
      run({ action: "create", ...fields, protocol, port: portNumber });
    } else {
      run({
        action: "edit",
        id: target.listener.id,
        ...fields,
        ...(headersChanged ? { insertHeaders } : {}),
        ...(defaultPoolChange ? { defaultPool: defaultPoolChange } : {}),
        source: {
          name: initial.name,
          description: initial.description,
          adminStateUp: initial.adminStateUp,
          ...(advancedChanged ? { settings: sourceSettings } : {}),
        },
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        showCloseButton={!pending}
      >
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {creating ? "Create listener" : "Edit listener"}
            </DialogTitle>
            <DialogDescription>
              {creating
                ? "Choose a protocol and port on this load balancer."
                : "Update the listener without changing its protocol or port."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="octavia-listener-name">Name</Label>
            <Input
              id="octavia-listener-name"
              maxLength={255}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="octavia-listener-description">Description</Label>
            <Textarea
              id="octavia-listener-description"
              maxLength={255}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
            />
          </div>
          {creating ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="octavia-listener-protocol">Protocol</Label>
                <Select
                  value={protocol}
                  onValueChange={(value: OctaviaListenerProtocol) =>
                    setProtocol(value)
                  }
                  disabled={pending}
                >
                  <SelectTrigger
                    id="octavia-listener-protocol"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "HTTPS" ? "HTTPS passthrough" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="octavia-listener-port">Port</Label>
                <Input
                  id="octavia-listener-port"
                  type="number"
                  min={1}
                  max={65535}
                  step={1}
                  required
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
          ) : null}
          <Label
            className="flex items-center gap-2"
            htmlFor="octavia-listener-admin"
          >
            <Checkbox
              id="octavia-listener-admin"
              checked={adminStateUp}
              onCheckedChange={(checked) => setAdminStateUp(checked === true)}
              disabled={pending}
            />
            Admin state up
          </Label>
          {defaultPoolSupported ? (
            <div className="space-y-2">
              <Label htmlFor="octavia-listener-default-pool">
                Default pool
              </Label>
              {canChooseDefaultPool ? (
                <>
                  <Select
                    value={defaultPoolId ?? NO_DEFAULT_POOL}
                    onValueChange={(value) =>
                      setDefaultPoolId(value === NO_DEFAULT_POOL ? null : value)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="octavia-listener-default-pool"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEFAULT_POOL}>
                        No default pool
                      </SelectItem>
                      {originalDefaultPoolId &&
                      !poolChoices.some(
                        ({ id }) => id === originalDefaultPoolId,
                      ) ? (
                        <SelectItem value={originalDefaultPoolId}>
                          {originalPool?.name || originalDefaultPoolId}{" "}
                          (current)
                        </SelectItem>
                      ) : null}
                      {defaultPoolChange?.after && !selectedPool ? (
                        <SelectItem value={defaultPoolChange.after} disabled>
                          Selected pool unavailable
                        </SelectItem>
                      ) : null}
                      {poolChoices.map((pool) => (
                        <SelectItem value={pool.id} key={pool.id}>
                          {pool.name || pool.id} ({pool.protocol}
                          {pool.admin_state_up === false ? ", disabled" : ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {poolQuery.isLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      Loading compatible pools.
                    </p>
                  ) : poolQuery.isError ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>Pool choices could not be loaded.</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        loading={poolQuery.isFetching}
                        onClick={() => void poolQuery.refetch()}
                      >
                        <RefreshCw /> Retry
                      </Button>
                    </div>
                  ) : poolChoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No compatible Active pools are available.
                    </p>
                  ) : null}
                  {defaultPoolChange?.after === null ? (
                    <MutationAlert variant="warning">
                      Traffic that does not match an L7 policy will have no
                      default route. The current pool and its members will be
                      kept.
                    </MutationAlert>
                  ) : defaultPoolChange && selectedPool ? (
                    <MutationAlert variant="warning">
                      Traffic that does not match an L7 policy will use{" "}
                      {selectedPool.name || selectedPool.id}.
                      {originalDefaultPoolId
                        ? " The previous pool and its members will be kept."
                        : ""}
                      {selectedPool.admin_state_up === false
                        ? " The selected pool is disabled."
                        : selectedPool.memberCount === 0
                          ? " The selected pool has no members."
                          : ""}
                    </MutationAlert>
                  ) : defaultPoolChange ? (
                    <MutationAlert variant="warning">
                      The selected pool is no longer available. Select another
                      pool or keep the current assignment.
                    </MutationAlert>
                  ) : null}
                </>
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  id="octavia-listener-default-pool"
                >
                  Octavia did not report the current default pool.
                </p>
              )}
            </div>
          ) : null}
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced settings
            </summary>
            <div className="mt-3 space-y-4">
              {numericKeys.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {numericKeys.map((key) => {
                    const field = LISTENER_NUMERIC_FIELDS[key];
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={"octavia-listener-" + key}>
                          {field.label}
                        </Label>
                        <Input
                          id={"octavia-listener-" + key}
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={1}
                          placeholder="Cloud default"
                          value={numbers[key] ?? initial.listener?.[key] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setNumbers((current) => ({
                              ...current,
                              [key]: value,
                            }));
                          }}
                          disabled={pending}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {numericKeys.length ? (
                <p className="text-xs text-muted-foreground">
                  Blank uses the cloud default. A connection limit of -1 uses
                  the provider default.
                </p>
              ) : null}
              {showCidrs ? (
                <div className="space-y-2">
                  <Label htmlFor="octavia-listener-cidr-mode">
                    Allowed CIDRs
                  </Label>
                  <Select
                    value={cidrMode}
                    onValueChange={(value: "any" | "restricted") =>
                      setCidrMode(value)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="octavia-listener-cidr-mode"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any source</SelectItem>
                      <SelectItem
                        value="restricted"
                        disabled={Boolean(cidrUnavailable)}
                      >
                        CIDR allowlist
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {cidrMode === "restricted" ? (
                    <>
                      <Label htmlFor="octavia-listener-cidrs">
                        CIDR prefixes
                      </Label>
                      <Textarea
                        id="octavia-listener-cidrs"
                        value={cidrText}
                        onChange={(event) => setCidrText(event.target.value)}
                        placeholder="192.0.2.0/24"
                        disabled={pending || Boolean(cidrUnavailable)}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
              {cidrUnavailable ? (
                <p className="text-xs text-muted-foreground">
                  {cidrUnavailable}
                </p>
              ) : null}
              {initialHeaders && editableHeaders.length ? (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">
                    Insert headers
                  </legend>
                  {editableHeaders.map((header) => (
                    <Label
                      key={header}
                      className="flex items-center gap-2 wrap-anywhere"
                    >
                      <Checkbox
                        checked={
                          headerChoices[header] ??
                          isListenerInsertHeaderEnabled(initialHeaders[header])
                        }
                        onCheckedChange={(checked) =>
                          setHeaderChoices((choices) => ({
                            ...choices,
                            [header]: checked === true,
                          }))
                        }
                        disabled={pending}
                      />
                      {header}
                    </Label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          </details>
          {creating ? (
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
          ) : null}
          {creating && quota.issues.length > 0 ? (
            <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
          ) : null}
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          {settingsError ? (
            <MutationAlert>{settingsError}</MutationAlert>
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
            <Button type="submit" loading={pending} disabled={!allowed}>
              {creating ? (
                <Plus className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {creating ? "Create listener" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
