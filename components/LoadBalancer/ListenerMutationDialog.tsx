"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Save, Trash2, Undo2 } from "lucide-react";

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
import { loadBalancerPoolChoicesQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { MutationScope } from "@/lib/mutations";
import type { OpenStackServiceCapabilities } from "@/lib/openstack/capabilities";
import {
  listOctaviaTlsSecretsAction,
  mutateLoadBalancerListenerAction,
  type OctaviaListenerMutation,
} from "@/lib/openstack/octavia-actions";
import {
  isOctaviaAmphoraProvider,
  octaviaListenerDeletionBlock,
} from "@/lib/openstack/octavia";
import {
  availableListenerProtocols,
  editableListenerInsertHeaders,
  isListenerInsertHeaderEnabled,
  LISTENER_CLIENT_AUTH_LABELS,
  LISTENER_NUMERIC_FIELDS,
  LISTENER_NUMERIC_KEYS,
  listenerCidrError,
  listenerClientAuthUnavailable,
  listenerSettingUnavailable,
  octaviaTlsSecretId,
  OCTAVIA_SNI_CERTIFICATE_REQUIRED,
  readListenerInsertHeaders,
  readListenerClientAuth,
  readOctaviaSniRefs,
  sameListenerCidrs,
  type ListenerNumericField,
  type ListenerClientAuthMode,
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
const KEEP_TLS_CERTIFICATE = "keep-current";
const NO_SNI_ADDITION = "no-addition";
const KEEP_CLIENT_CA = "keep-client-ca";

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
    sniRefs: readOctaviaSniRefs(listener?.sni_container_refs),
    clientAuth: listener ? readListenerClientAuth(listener) : null,
  }));
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [adminStateUp, setAdminStateUp] = useState(initial.adminStateUp);
  const [protocol, setProtocol] = useState<OctaviaListenerProtocol>(
    protocols[0],
  );
  const [tlsSecretId, setTlsSecretId] = useState("");
  const [sniSecretId, setSniSecretId] = useState("");
  const [removedSniRefs, setRemovedSniRefs] = useState<string[]>([]);
  const [clientAuthMode, setClientAuthMode] = useState<ListenerClientAuthMode>(
    initial.clientAuth?.mode ?? "NONE",
  );
  const [clientCaSecretId, setClientCaSecretId] = useState("");
  const currentTlsRef = initial.listener?.default_tls_container_ref;
  const currentTlsSecretId = octaviaTlsSecretId(currentTlsRef);
  const editingTerminatedHttps =
    target.action === "edit" &&
    initial.listener?.protocol === "TERMINATED_HTTPS" &&
    isOctaviaAmphoraProvider(loadBalancer.provider);
  const hasDefaultTlsRef =
    typeof currentTlsRef === "string" && Boolean(currentTlsRef.trim());
  const canRotateTls = editingTerminatedHttps && hasDefaultTlsRef;
  const canManageSni =
    editingTerminatedHttps &&
    initial.sniRefs !== null &&
    (currentTlsRef === null || hasDefaultTlsRef);
  const clientAuthBlock =
    editingTerminatedHttps && initial.listener
      ? listenerClientAuthUnavailable(
          loadBalancer.provider,
          initial.listener,
          capabilities,
        )
      : null;
  const tlsSecrets = useQuery({
    queryKey: [
      initial.scope.regionId,
      initial.scope.projectId,
      "octavia",
      "tls-secrets",
    ],
    queryFn: () => listOctaviaTlsSecretsAction(initial.scope),
    enabled:
      canRotateTls ||
      canManageSni ||
      (creating && isOctaviaAmphoraProvider(loadBalancer.provider)),
    staleTime: 0,
    retry: false,
  });
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
  const tlsProtocol = creating && protocol === "TERMINATED_HTTPS";
  const tlsOptions = tlsSecrets.isError
    ? []
    : (tlsSecrets.data ?? []).filter(
        ({ id }) => !canRotateTls || id !== currentTlsSecretId,
      );
  const selectedTlsSecret = tlsOptions.find(({ id }) => id === tlsSecretId);
  const currentTlsSecretName = tlsSecrets.data?.find(
    ({ id }) => id === currentTlsSecretId,
  )?.name;
  const defaultCertificateChange =
    canRotateTls && currentTlsRef && tlsSecretId
      ? { before: currentTlsRef, after: tlsSecretId }
      : undefined;
  const sniOptions =
    canManageSni && initial.sniRefs
      ? tlsOptions.filter(
          ({ id }) =>
            id !== tlsSecretId &&
            !initial.sniRefs?.some((ref) => octaviaTlsSecretId(ref) === id),
        )
      : [];
  const selectedSniSecret = sniOptions.find(({ id }) => id === sniSecretId);
  const sniCertificateChange =
    canManageSni &&
    currentTlsRef !== undefined &&
    initial.sniRefs &&
    (sniSecretId || removedSniRefs.length)
      ? {
          before: initial.sniRefs,
          beforeDefault: currentTlsRef,
          remove: removedSniRefs,
          add: sniSecretId || undefined,
        }
      : undefined;
  const removesLastSniCertificate =
    currentTlsRef === null &&
    sniCertificateChange !== undefined &&
    removedSniRefs.length > 0 &&
    !selectedSniSecret &&
    removedSniRefs.length === sniCertificateChange.before.length;
  const clientCaId = octaviaTlsSecretId(initial.clientAuth?.caRef);
  const clientCaOptions = tlsSecrets.isError
    ? []
    : tlsOptions.filter(
        ({ id }) =>
          id !== clientCaId &&
          id !== tlsSecretId &&
          id !== sniSecretId &&
          !initial.sniRefs?.some((ref) => octaviaTlsSecretId(ref) === id),
      );
  const selectedClientCa = clientCaOptions.find(
    ({ id }) => id === clientCaSecretId,
  );
  const clientAuthChange =
    editingTerminatedHttps &&
    !clientAuthBlock &&
    initial.clientAuth &&
    (clientAuthMode !== initial.clientAuth.mode || clientCaSecretId)
      ? {
          before: initial.clientAuth,
          mode: clientAuthMode,
          ...(clientCaSecretId ? { caSecretId: clientCaSecretId } : {}),
        }
      : undefined;
  const clientAuthError =
    clientAuthChange &&
    (clientCaSecretId && !selectedClientCa
      ? "The selected client CA is no longer available."
      : clientAuthMode !== "NONE" &&
          !initial.clientAuth?.caRef &&
          !selectedClientCa
        ? "Select a client CA certificate."
        : null);
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
    clientAuthChange !== undefined ||
    sniCertificateChange !== undefined ||
    defaultCertificateChange !== undefined ||
    defaultPoolChange !== undefined;
  const allowed =
    !settingsError &&
    (creating
      ? validPort &&
        protocols.includes(protocol) &&
        quota.issues.length === 0 &&
        (!tlsProtocol || Boolean(selectedTlsSecret))
      : changed &&
        !clientAuthError &&
        (!defaultCertificateChange || Boolean(selectedTlsSecret)) &&
        (!sniSecretId || Boolean(selectedSniSecret)) &&
        !removesLastSniCertificate &&
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
      run({
        action: "create",
        ...fields,
        protocol,
        port: portNumber,
        ...(tlsProtocol && selectedTlsSecret
          ? { tlsSecretId: selectedTlsSecret.id }
          : {}),
      });
    } else {
      run({
        action: "edit",
        id: target.listener.id,
        ...fields,
        ...(headersChanged ? { insertHeaders } : {}),
        ...(clientAuthChange ? { clientAuthentication: clientAuthChange } : {}),
        ...(defaultCertificateChange
          ? { defaultCertificate: defaultCertificateChange }
          : {}),
        ...(defaultPoolChange ? { defaultPool: defaultPoolChange } : {}),
        ...(sniCertificateChange
          ? { sniCertificates: sniCertificateChange }
          : {}),
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
                    {protocols
                      .filter(
                        (option) =>
                          option !== "TERMINATED_HTTPS" ||
                          tlsSecrets.isSuccess ||
                          tlsProtocol,
                      )
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === "HTTPS"
                            ? "HTTPS passthrough"
                            : option === "TERMINATED_HTTPS"
                              ? "Terminated HTTPS"
                              : option}
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
          {tlsProtocol || canRotateTls ? (
            <div className="space-y-1.5">
              {canRotateTls ? (
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Current certificate
                  </span>
                  {currentTlsSecretId ? (
                    <ResourceLink
                      href={`/key-manager/secrets/${currentTlsSecretId}`}
                      target="_blank"
                      className="wrap-anywhere font-mono text-xs"
                    >
                      {currentTlsSecretName
                        ? `${currentTlsSecretName} (${currentTlsSecretId.slice(0, 8)})`
                        : currentTlsSecretId}
                    </ResourceLink>
                  ) : (
                    <span>External certificate reference</span>
                  )}
                </div>
              ) : null}
              <Label htmlFor="octavia-listener-tls-secret">
                {canRotateTls
                  ? "Replacement certificate"
                  : "Default certificate"}
              </Label>
              <Select
                disabled={
                  pending || (!tlsOptions.length && !defaultCertificateChange)
                }
                value={
                  selectedTlsSecret?.id ??
                  (canRotateTls && !tlsSecretId ? KEEP_TLS_CERTIFICATE : "")
                }
                onValueChange={(id) =>
                  setTlsSecretId(id === KEEP_TLS_CERTIFICATE ? "" : id)
                }
              >
                <SelectTrigger
                  id="octavia-listener-tls-secret"
                  aria-describedby="octavia-listener-tls-help"
                  aria-invalid={Boolean(
                    defaultCertificateChange && !selectedTlsSecret,
                  )}
                >
                  <SelectValue
                    placeholder={
                      defaultCertificateChange
                        ? "Replacement unavailable"
                        : tlsOptions.length
                          ? "Select a Barbican secret"
                          : "No certificates available"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
                  {canRotateTls ? (
                    <SelectItem value={KEEP_TLS_CERTIFICATE}>
                      Keep current certificate
                    </SelectItem>
                  ) : null}
                  {tlsOptions.map(({ id, name }) => (
                    <SelectItem key={id} value={id} className="wrap-anywhere">
                      {canRotateTls && name
                        ? `${name} (${id.slice(0, 8)})`
                        : name || id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="octavia-listener-tls-help"
                className="text-xs text-muted-foreground"
              >
                Choose an unencrypted PKCS#12 bundle stored as a binary secret
                in{" "}
                <ResourceLink href="/key-manager/secrets" target="_blank">
                  Key Manager
                </ResourceLink>
                .
              </p>
              {tlsSecrets.isError ? (
                <MutationAlert>Could not load TLS secrets.</MutationAlert>
              ) : defaultCertificateChange && !selectedTlsSecret ? (
                <MutationAlert>
                  The selected replacement is no longer available.
                </MutationAlert>
              ) : canRotateTls && tlsSecrets.isSuccess && !tlsOptions.length ? (
                <p className="text-xs text-muted-foreground">
                  No replacement certificates available.
                </p>
              ) : null}
            </div>
          ) : null}
          {canManageSni && initial.sniRefs ? (
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">SNI certificates</legend>
              {initial.sniRefs.length ? (
                <ul className="divide-y rounded-md border">
                  {initial.sniRefs.map((ref, index) => {
                    const id = octaviaTlsSecretId(ref);
                    const secretName = tlsSecrets.data?.find(
                      (secret) => secret.id === id,
                    )?.name;
                    const label =
                      secretName && id
                        ? `${secretName} (${id.slice(0, 8)})`
                        : (id ?? `External certificate ${index + 1}`);
                    const removed = removedSniRefs.includes(ref);
                    const command = removed
                      ? `Keep SNI certificate ${label}`
                      : `Remove SNI certificate ${label}`;
                    return (
                      <li
                        key={ref}
                        className="flex min-w-0 items-center justify-between gap-2 p-2 text-sm"
                      >
                        <span
                          className={
                            removed
                              ? "min-w-0 wrap-anywhere text-muted-foreground line-through"
                              : "min-w-0 wrap-anywhere"
                          }
                        >
                          {label}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          tone={removed ? undefined : "danger"}
                          disabled={pending}
                          title={command}
                          aria-label={command}
                          onClick={() =>
                            setRemovedSniRefs((refs) =>
                              removed
                                ? refs.filter((value) => value !== ref)
                                : [...refs, ref],
                            )
                          }
                        >
                          {removed ? <Undo2 /> : <Trash2 />}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No SNI certificates configured.
                </p>
              )}
              <Label htmlFor="octavia-listener-sni-add">
                Add SNI certificate
              </Label>
              <Select
                disabled={pending || (!sniOptions.length && !sniSecretId)}
                value={
                  selectedSniSecret?.id ?? (sniSecretId ? "" : NO_SNI_ADDITION)
                }
                onValueChange={(id) =>
                  setSniSecretId(id === NO_SNI_ADDITION ? "" : id)
                }
              >
                <SelectTrigger
                  id="octavia-listener-sni-add"
                  aria-invalid={Boolean(sniSecretId && !selectedSniSecret)}
                >
                  <SelectValue placeholder="Selected certificate unavailable" />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
                  <SelectItem value={NO_SNI_ADDITION}>
                    Do not add a certificate
                  </SelectItem>
                  {sniOptions.map(({ id, name }) => (
                    <SelectItem key={id} value={id} className="wrap-anywhere">
                      {name ? `${name} (${id.slice(0, 8)})` : id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sniSecretId && !selectedSniSecret ? (
                <MutationAlert>
                  Select a different SNI certificate or clear the selection.
                </MutationAlert>
              ) : null}
              {removesLastSniCertificate ? (
                <MutationAlert>
                  {OCTAVIA_SNI_CERTIFICATE_REQUIRED}
                </MutationAlert>
              ) : null}
            </fieldset>
          ) : null}
          {editingTerminatedHttps ? (
            <fieldset className="min-w-0 space-y-2" disabled={pending}>
              <legend className="text-sm font-medium">
                Client certificates
              </legend>
              {clientAuthBlock ? (
                <p className="text-sm text-muted-foreground">
                  {clientAuthBlock}
                </p>
              ) : initial.clientAuth ? (
                <>
                  <Label htmlFor="octavia-listener-client-auth">
                    Authentication
                  </Label>
                  <Select
                    value={clientAuthMode}
                    disabled={pending}
                    onValueChange={(mode: ListenerClientAuthMode) => {
                      setClientAuthMode(mode);
                      if (mode === "NONE") setClientCaSecretId("");
                    }}
                  >
                    <SelectTrigger
                      id="octavia-listener-client-auth"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LISTENER_CLIENT_AUTH_LABELS).map(
                        ([mode, label]) => (
                          <SelectItem value={mode} key={mode}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  {clientAuthMode === "NONE" ? (
                    clientAuthChange && initial.clientAuth.caRef ? (
                      <p className="text-xs text-muted-foreground">
                        Disabling authentication keeps the configured client CA.
                      </p>
                    ) : null
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {clientAuthMode === "MANDATORY"
                          ? "Clients must present a trusted certificate to connect."
                          : "Clients may connect without a certificate; any certificate presented must be trusted."}
                      </p>
                      <Label htmlFor="octavia-listener-client-ca">
                        Client CA certificate
                      </Label>
                      <Select
                        value={
                          selectedClientCa?.id ??
                          (clientCaSecretId ? "" : KEEP_CLIENT_CA)
                        }
                        disabled={pending}
                        onValueChange={(id) =>
                          setClientCaSecretId(id === KEEP_CLIENT_CA ? "" : id)
                        }
                      >
                        <SelectTrigger
                          id="octavia-listener-client-ca"
                          className="w-full"
                          aria-invalid={Boolean(clientAuthError)}
                          aria-describedby="octavia-listener-client-ca-help"
                        >
                          <SelectValue placeholder="Selected client CA unavailable" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
                          <SelectItem value={KEEP_CLIENT_CA}>
                            {initial.clientAuth.caRef
                              ? "Keep current client CA"
                              : "Select a Barbican secret"}
                          </SelectItem>
                          {clientCaOptions.map(({ id, name }) => (
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
                        id="octavia-listener-client-ca-help"
                        className="text-xs text-muted-foreground"
                      >
                        PEM-encoded CA certificate, without a private key,
                        stored as a binary secret in{" "}
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
                          Could not load client CA secrets.
                        </MutationAlert>
                      ) : null}
                      {clientAuthError ? (
                        <MutationAlert>{clientAuthError}</MutationAlert>
                      ) : null}
                    </>
                  )}
                </>
              ) : null}
            </fieldset>
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
