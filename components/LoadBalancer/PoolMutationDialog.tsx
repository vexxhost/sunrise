"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { ResourceLink } from "@/components/resources/ResourceLink";
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
  listOctaviaTlsSecretsAction,
  mutateLoadBalancerPoolAction,
  type OctaviaPoolMutation,
} from "@/lib/openstack/octavia-actions";
import { isOctaviaAmphoraProvider } from "@/lib/openstack/octavia";
import { octaviaTlsSecretId } from "@/lib/openstack/octavia-listener-settings";
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
  poolTlsEditBlock,
  poolTlsReadApiVersion,
  readPoolPersistence,
  readPoolTls,
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
      l7Policies:
        | ReadonlyArray<Pick<OctaviaL7Policy, "redirect_pool_id">>
        | null
        | undefined;
    };

const NO_LISTENER = "none";
const NO_PERSISTENCE = "none";
const KEEP_MEMBER_CA = "keep-member-ca";

export function PoolMutationDialog({
  target,
  loadBalancerId,
  creation,
  backendTlsSupported,
  l7Policies,
  scope,
  onClose,
  onRefresh,
  onSuccess,
}: {
  loadBalancerId: string;
  backendTlsSupported?: boolean;
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
    tls: pool ? readPoolTls(pool) : null,
  }));
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [adminStateUp, setAdminStateUp] = useState(initial.adminStateUp);
  const [algorithm, setAlgorithm] = useState(initial.algorithm);
  const [listenerId, setListenerId] = useState(NO_LISTENER);
  const [protocol, setProtocol] = useState<OctaviaPoolProtocol>("HTTP");
  const [tlsEnabled, setTlsEnabled] = useState(initial.tls?.enabled ?? false);
  const [caSecretId, setCaSecretId] = useState("");
  const chooseProtocol = (next: OctaviaPoolProtocol) => {
    setProtocol(next);
    if (next !== "HTTP") {
      setTlsEnabled(false);
      setCaSecretId("");
    }
  };
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
  const activeProtocol = creating ? protocol : (pool?.protocol ?? "");
  const showBackendTls =
    activeProtocol === "HTTP" &&
    (creation
      ? isOctaviaAmphoraProvider(creation.provider) &&
        Boolean(poolTlsReadApiVersion(creation.capabilities))
      : target.action === "edit" && backendTlsSupported);
  const tlsBlock = creating ? null : poolTlsEditBlock(initial.tls);
  const tlsSecrets = useQuery({
    queryKey: [
      submission.scope.regionId,
      submission.scope.projectId,
      "octavia",
      "tls-secrets",
    ],
    queryFn: () => listOctaviaTlsSecretsAction(submission.scope),
    enabled: Boolean(showBackendTls && !tlsBlock && tlsEnabled),
    staleTime: 0,
    retry: false,
  });
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
    const dependencyBlock = octaviaPoolDeletionBlock(
      target.pool,
      l7Policies ?? [],
    );
    const checking = !dependencyBlock && l7Policies === undefined;
    const blocked =
      dependencyBlock ??
      (checking
        ? "Checking L7 policy dependencies."
        : l7Policies === null
          ? "The pool's L7 policy dependencies could not be verified. Close this dialog and retry."
          : null);
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
          <MutationAlert variant={checking ? "info" : "warning"}>
            {blocked}
          </MutationAlert>
        ) : null}
      </MutationConfirmationDialog>
    );
  }

  const supportedAlgorithm = OCTAVIA_POOL_ALGORITHMS.includes(
    algorithm as OctaviaPoolAlgorithm,
  );
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
  const tlsChanged =
    tlsEnabled !== (initial.tls?.enabled ?? false) || Boolean(caSecretId);
  const tlsUnavailable = tlsChanged && (!showBackendTls || tlsBlock);
  const currentCaId = octaviaTlsSecretId(initial.tls?.caRef);
  const caOptions = tlsSecrets.isError
    ? []
    : (tlsSecrets.data ?? []).filter(({ id }) => id !== currentCaId);
  const selectedCa = caOptions.find(({ id }) => id === caSecretId);
  const tlsError =
    tlsChanged && tlsEnabled
      ? caSecretId && !selectedCa
        ? "The selected member CA is no longer available."
        : !initial.tls?.caRef && !selectedCa
          ? "Select a member CA certificate."
          : null
      : null;
  const unchanged =
    name === initial.name &&
    description === initial.description &&
    adminStateUp === initial.adminStateUp &&
    algorithm === initial.algorithm &&
    !persistenceChanged &&
    !tlsChanged;
  const disabled =
    requiresReopen ||
    Boolean(persistenceError) ||
    Boolean(tlsError) ||
    Boolean(tlsUnavailable) ||
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
                ...(tlsChanged && selectedCa
                  ? { backendTls: { caSecretId: selectedCa.id } }
                  : {}),
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
                ...(tlsChanged && initial.tls
                  ? {
                      backendTls: {
                        before: initial.tls,
                        enabled: tlsEnabled,
                        ...(selectedCa ? { caSecretId: selectedCa.id } : {}),
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
          {tlsUnavailable ? (
            <MutationAlert variant="warning">
              Backend TLS settings are no longer available. Reopen the form to
              review your changes.
            </MutationAlert>
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
                    chooseProtocol(
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
                    chooseProtocol(next as OctaviaPoolProtocol)
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
          {showBackendTls ? (
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">Backend TLS</legend>
              {tlsBlock ? (
                <p className="text-sm text-muted-foreground">{tlsBlock}</p>
              ) : (
                <>
                  <Label
                    htmlFor="pool-tls-enabled"
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      id="pool-tls-enabled"
                      checked={tlsEnabled}
                      disabled={pending}
                      onCheckedChange={(checked) => {
                        setTlsEnabled(checked === true);
                        if (checked !== true) setCaSecretId("");
                      }}
                    />
                    Encrypt connections to members
                  </Label>
                  {tlsEnabled ? (
                    <>
                      <Label htmlFor="pool-member-ca">
                        Member CA certificate
                      </Label>
                      <Select
                        disabled={pending}
                        value={
                          selectedCa?.id ?? (caSecretId ? "" : KEEP_MEMBER_CA)
                        }
                        onValueChange={(id) =>
                          setCaSecretId(id === KEEP_MEMBER_CA ? "" : id)
                        }
                      >
                        <SelectTrigger
                          id="pool-member-ca"
                          className="w-full"
                          aria-invalid={Boolean(tlsError)}
                          aria-describedby="pool-member-ca-help"
                        >
                          <SelectValue placeholder="Selected member CA unavailable" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
                          <SelectItem value={KEEP_MEMBER_CA}>
                            {initial.tls?.caRef
                              ? "Keep current member CA"
                              : "Select a Barbican secret"}
                          </SelectItem>
                          {caOptions.map(({ id, name }) => (
                            <SelectItem
                              key={id}
                              value={id}
                              className="wrap-anywhere"
                            >
                              {name ? `${name} (${id.slice(0, 8)})` : id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p
                        id="pool-member-ca-help"
                        className="text-xs text-muted-foreground"
                      >
                        A PEM CA certificate stored as a binary secret in{" "}
                        <ResourceLink
                          href="/key-manager/secrets"
                          target="_blank"
                        >
                          Key Manager
                        </ResourceLink>
                        .
                      </p>
                      {tlsSecrets.isError ? (
                        <MutationAlert variant="warning">
                          Could not load member CA secrets.
                        </MutationAlert>
                      ) : null}
                      {tlsError ? (
                        <MutationAlert>{tlsError}</MutationAlert>
                      ) : null}
                    </>
                  ) : null}
                  {tlsChanged && !creating && !tlsEnabled ? (
                    <MutationAlert variant="warning">
                      Disabling TLS sends member traffic unencrypted. The member
                      CA stays configured.
                    </MutationAlert>
                  ) : tlsChanged && !creating && pool?.members?.length ? (
                    <MutationAlert variant="warning">
                      This change affects connections to existing pool members.
                    </MutationAlert>
                  ) : null}
                </>
              )}
            </fieldset>
          ) : null}
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
