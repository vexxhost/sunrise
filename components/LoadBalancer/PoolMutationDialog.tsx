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
import { Textarea } from "@/components/ui/textarea";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { MutationScope } from "@/lib/mutations";
import type { OpenStackServiceCapabilities } from "@/lib/openstack/capabilities";
import {
  mutateLoadBalancerPoolAction,
  type OctaviaPoolMutation,
} from "@/lib/openstack/octavia-actions";
import {
  availablePoolPersistenceModes,
  availablePoolProtocols,
  canAttachNewOctaviaPool,
  describePoolPersistence,
  formatPoolAlgorithm,
  formatPoolPersistence,
  OCTAVIA_POOL_ALGORITHMS,
  octaviaPoolDeletionBlock,
  poolMutationRecovery,
  poolPersistenceError,
  readPoolPersistence,
  type OctaviaPoolAlgorithm,
  type OctaviaPoolPersistenceMode,
  type OctaviaPoolProtocol,
} from "@/lib/openstack/octavia-pool-settings";
import type {
  OctaviaL7Policy,
  OctaviaListener,
  OctaviaPool,
} from "@/types/openstack";

export type PoolDialogAction =
  | { action: "create" }
  | { action: "edit"; pool: OctaviaPool }
  | { action: "delete"; pool: OctaviaPool };

type PoolDialogOperations =
  | {
      target: Extract<PoolDialogAction, { action: "create" }>;
      creation: {
        provider?: string;
        capabilities: OpenStackServiceCapabilities;
        listeners: OctaviaListener[];
      };
      l7Policies?: never;
    }
  | {
      target: Extract<PoolDialogAction, { action: "edit" }>;
      creation?: never;
      l7Policies?: never;
    }
  | {
      target: Extract<PoolDialogAction, { action: "delete" }>;
      creation?: never;
      l7Policies: OctaviaL7Policy[];
    };

const NO_LISTENER = "none";
const NO_PERSISTENCE = "none";

export function PoolMutationDialog({
  target,
  loadBalancerId,
  creation,
  l7Policies,
  scope,
  onClose,
  onRefresh,
  onSuccess,
}: {
  loadBalancerId: string;
  scope: MutationScope;
  onClose: () => void;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
} & PoolDialogOperations) {
  const creating = target.action === "create";
  const pool = creating ? undefined : target.pool;
  const [initial] = useState(() => ({
    name: pool?.name ?? "",
    description: pool?.description ?? "",
    adminStateUp: pool?.admin_state_up ?? true,
    algorithm: pool?.lb_algorithm ?? "ROUND_ROBIN",
    persistence: readPoolPersistence(pool?.session_persistence),
  }));
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [adminStateUp, setAdminStateUp] = useState(initial.adminStateUp);
  const [algorithm, setAlgorithm] = useState(initial.algorithm);
  const [listenerId, setListenerId] = useState(NO_LISTENER);
  const [protocol, setProtocol] = useState<OctaviaPoolProtocol>("HTTP");
  const initialPersistenceMode = initial.persistence?.type ?? NO_PERSISTENCE;
  const initialCookieName = initial.persistence?.cookie_name ?? "";
  const [persistenceMode, setPersistenceMode] = useState(
    initialPersistenceMode,
  );
  const [cookieName, setCookieName] = useState(initialCookieName);
  const [error, setError] = useState<string | null>(null);
  const [requiresReopen, setRequiresReopen] = useState(false);
  const [submission] = useState(() => ({ scope, loadBalancerId }));
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const quota = useProjectQuotaImpact({
    enabled: creating,
    projectId: scope.projectId,
    regionId: scope.regionId,
    requests: [{ metricId: "pool", requested: 1 }],
    serviceId: "load-balancing",
  });
  const protocolsFor = (listenerProtocol?: string) =>
    creation
      ? availablePoolProtocols(
          creation.provider,
          creation.capabilities,
          listenerProtocol,
        )
      : [];
  const eligibleListeners =
    creation?.listeners.filter(
      (listener) =>
        canAttachNewOctaviaPool(listener) &&
        protocolsFor(listener.protocol).length > 0,
    ) ?? [];
  const selectedListener = eligibleListeners.find(
    ({ id }) => id === listenerId,
  );
  const protocols = protocolsFor(selectedListener?.protocol);
  const staleListener = listenerId !== NO_LISTENER && !selectedListener;
  const close = () => {
    if (!inFlight.current) onClose();
  };
  const run = (input: OctaviaPoolMutation) => {
    if (inFlight.current || requiresReopen) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mutateLoadBalancerPoolAction(
          submission.scope,
          submission.loadBalancerId,
          input,
        );
        if (result.ok) {
          onSuccess(result.message);
          return;
        }
        const { code, message } = result.error;
        const { needsRefresh, needsReopen } = poolMutationRecovery(
          code,
          creating,
        );
        if (needsRefresh) onRefresh();
        if (needsReopen) setRequiresReopen(true);
        setError(
          needsReopen
            ? `${message} Close this dialog to check the pool before retrying.`
            : message,
        );
      } catch {
        setRequiresReopen(true);
        onRefresh();
        setError(
          "The result could not be confirmed. Close this dialog to check the load balancer before retrying.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };

  if (target.action === "delete") {
    const blocked = l7Policies
      ? octaviaPoolDeletionBlock(target.pool, l7Policies)
      : "The pool's L7 policy dependencies are unavailable. Refresh before deleting it.";
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Delete pool?"
        description={
          <>
            <span className="wrap-anywhere font-medium">
              {target.pool.name || target.pool.id}
            </span>{" "}
            will be permanently deleted.
            {target.pool.listeners?.length
              ? " Listeners using this as their default pool will lose that default route."
              : ""}
          </>
        }
        confirmLabel="Delete pool"
        variant="destructive"
        pending={pending}
        error={error}
        confirmDisabled={requiresReopen || Boolean(blocked)}
        onConfirm={() => {
          if (!blocked)
            run({
              action: "delete",
              id: target.pool.id,
              listenerIds: target.pool.listeners!.map(({ id }) => id),
            });
        }}
      >
        {blocked ? (
          <MutationAlert variant="warning">{blocked}</MutationAlert>
        ) : null}
      </MutationConfirmationDialog>
    );
  }

  const supportedAlgorithm = OCTAVIA_POOL_ALGORITHMS.includes(
    algorithm as OctaviaPoolAlgorithm,
  );
  const activeProtocol = creating ? protocol : (pool?.protocol ?? "");
  const persistenceModes = availablePoolPersistenceModes(activeProtocol);
  const canEditPersistence =
    persistenceModes.length > 0 && initial.persistence !== undefined;
  const persistence =
    persistenceMode === NO_PERSISTENCE
      ? null
      : {
          type: persistenceMode as OctaviaPoolPersistenceMode,
          ...(persistenceMode === "APP_COOKIE"
            ? { cookie_name: cookieName }
            : {}),
        };
  const persistenceChanged =
    canEditPersistence &&
    (persistenceMode !== initialPersistenceMode ||
      (persistenceMode === "APP_COOKIE" && cookieName !== initialCookieName));
  const persistenceError = persistenceChanged
    ? poolPersistenceError(activeProtocol, persistence)
    : null;
  const unchanged =
    name === initial.name &&
    description === initial.description &&
    adminStateUp === initial.adminStateUp &&
    algorithm === initial.algorithm &&
    !persistenceChanged;
  const disabled =
    requiresReopen ||
    Boolean(persistenceError) ||
    (creating
      ? staleListener ||
        !protocols.includes(protocol) ||
        quota.issues.length > 0
      : unchanged);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creating ? "Create pool" : "Edit pool"}</DialogTitle>
          <DialogDescription>
            {creating
              ? "Configure an Octavia backend pool."
              : pool?.name || pool?.id}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || disabled) return;
            const fields = { name, description, adminStateUp, algorithm };
            if (target.action === "create" && supportedAlgorithm) {
              run({
                ...fields,
                action: "create",
                protocol,
                algorithm: algorithm as OctaviaPoolAlgorithm,
                listenerId: selectedListener?.id,
                ...(persistence ? { persistence } : {}),
              });
            } else if (target.action === "edit") {
              run({
                ...fields,
                action: "edit",
                id: target.pool.id,
                source: {
                  name: initial.name,
                  description: initial.description,
                  adminStateUp: initial.adminStateUp,
                  algorithm: initial.algorithm,
                },
                ...(persistenceChanged && initial.persistence !== undefined
                  ? {
                      persistence: {
                        before: initial.persistence,
                        after: persistence,
                      },
                    }
                  : {}),
              });
            }
          }}
        >
          {error ? (
            <MutationAlert variant="error">{error}</MutationAlert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="pool-name">Name</Label>
            <Input
              id="pool-name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pool-description">Description</Label>
            <Textarea
              id="pool-description"
              value={description}
              maxLength={255}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
            />
          </div>
          {creating ? (
            <div className="space-y-2">
              <Label htmlFor="pool-listener">Default pool for</Label>
              <Select
                value={listenerId}
                disabled={pending}
                onValueChange={(next) => {
                  setListenerId(next);
                  const listener = eligibleListeners.find(
                    ({ id }) => id === next,
                  );
                  const allowed = protocolsFor(listener?.protocol);
                  if (!allowed.includes(protocol) && allowed[0]) {
                    setProtocol(
                      listener?.protocol === "HTTPS" &&
                        allowed.includes("HTTPS")
                        ? "HTTPS"
                        : allowed[0],
                    );
                  }
                }}
              >
                <SelectTrigger id="pool-listener" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LISTENER}>No listener</SelectItem>
                  {staleListener ? (
                    <SelectItem value={listenerId} disabled>
                      Listener no longer available
                    </SelectItem>
                  ) : null}
                  {eligibleListeners.map((listener) => (
                    <SelectItem key={listener.id} value={listener.id}>
                      {listener.name || listener.id} ({listener.protocol}:
                      {listener.protocol_port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pool-protocol">Protocol</Label>
              {creating ? (
                <Select
                  value={protocol}
                  onValueChange={(next) =>
                    setProtocol(next as OctaviaPoolProtocol)
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="pool-protocol" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="pool-protocol"
                  value={pool?.protocol ?? ""}
                  readOnly
                />
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="pool-algorithm">Algorithm</Label>
              <Select
                value={algorithm}
                onValueChange={setAlgorithm}
                disabled={pending}
              >
                <SelectTrigger id="pool-algorithm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!OCTAVIA_POOL_ALGORITHMS.includes(
                    initial.algorithm as OctaviaPoolAlgorithm,
                  ) ? (
                    <SelectItem value={initial.algorithm}>
                      {initial.algorithm}
                    </SelectItem>
                  ) : null}
                  {OCTAVIA_POOL_ALGORITHMS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatPoolAlgorithm(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor={
                canEditPersistence ? "pool-session-persistence" : undefined
              }
            >
              Session persistence
            </Label>
            {canEditPersistence ? (
              <Select
                value={persistenceMode}
                onValueChange={setPersistenceMode}
                disabled={pending}
              >
                <SelectTrigger id="pool-session-persistence" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PERSISTENCE}>None</SelectItem>
                  {persistence &&
                  !persistenceModes.some((mode) => mode === persistenceMode) ? (
                    <SelectItem value={persistenceMode} disabled>
                      {formatPoolPersistence(persistenceMode)} (not available)
                    </SelectItem>
                  ) : null}
                  {persistenceModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {formatPoolPersistence(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {describePoolPersistence(pool?.session_persistence)}
              </p>
            )}
            {canEditPersistence &&
            persistenceMode === "APP_COOKIE" &&
            activeProtocol === "HTTP" ? (
              <div className="space-y-2">
                <Label htmlFor="pool-cookie-name">Cookie name</Label>
                <Input
                  id="pool-cookie-name"
                  value={cookieName}
                  maxLength={255}
                  onChange={(event) => setCookieName(event.target.value)}
                  disabled={pending}
                  aria-invalid={Boolean(persistenceError)}
                  autoComplete="off"
                />
              </div>
            ) : null}
            {persistenceError ? (
              <MutationAlert variant="error">{persistenceError}</MutationAlert>
            ) : persistenceChanged && !creating && initial.persistence ? (
              <MutationAlert variant="warning">
                Changing session persistence can send existing sessions to a
                different backend.
              </MutationAlert>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pool-admin-state"
              checked={adminStateUp}
              onCheckedChange={(value) => setAdminStateUp(value === true)}
              disabled={pending}
            />
            <Label htmlFor="pool-admin-state">Administratively enabled</Label>
          </div>
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={disabled}>
              {creating ? <Plus /> : <Save />}
              {creating ? "Create pool" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
