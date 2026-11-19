"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  externalNetworksQueryOptions,
  floatingIpPortForwardingsQueryOptions,
} from "@/hooks/queries/useNetworks";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  createFloatingIpPortForwardingAction,
  deleteFloatingIpPortForwardingAction,
  updateFloatingIpPortForwardingAction,
} from "@/lib/openstack/neutron-port-forwarding-actions";
import {
  buildFloatingIpPortOptions,
  floatingIpPortSelectionValue,
  parseFloatingIpPortSelection,
} from "@/lib/openstack/neutron-floating-ip";
import {
  NEUTRON_PORT_FORWARDING_PROTOCOLS,
  parsePortForwardingPortRange,
  portForwardingExternalPorts,
  portForwardingInternalPorts,
  type NeutronPortForwardingProtocol,
} from "@/lib/openstack/neutron-port-forwarding";
import type {
  FloatingIp,
  FloatingIpPortForwarding,
  Port,
} from "@/types/openstack";

type DialogState =
  | { kind: "create" }
  | { kind: "delete"; rule: FloatingIpPortForwarding }
  | { kind: "edit"; rule: FloatingIpPortForwarding }
  | null;

function numberValue(value: string) {
  return value ? Number(value) : undefined;
}

function rulePortValues(rule: FloatingIpPortForwarding) {
  const external = parsePortForwardingPortRange(
    rule.external_port_range ??
      (rule.external_port == null ? null : String(rule.external_port)),
  );
  const internal = parsePortForwardingPortRange(
    rule.internal_port_range ??
      (rule.internal_port == null ? null : String(rule.internal_port)),
  );
  return {
    externalStart: external ? String(external.start) : "",
    externalEnd:
      external && external.end !== external.start ? String(external.end) : "",
    internalStart: internal ? String(internal.start) : "",
    internalEnd:
      internal && internal.end !== internal.start ? String(internal.end) : "",
  };
}

export function FloatingIpPortForwardingSection({
  baseSupport,
  descriptionSupport,
  floatingIp,
  owned,
  ports,
  projectId,
  rangeSupport,
  regionId,
}: {
  baseSupport: OpenStackFeatureSupport;
  descriptionSupport: OpenStackFeatureSupport;
  floatingIp: FloatingIp;
  owned: boolean;
  ports: Port[];
  projectId: string;
  rangeSupport: OpenStackFeatureSupport;
  regionId: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...floatingIpPortForwardingsQueryOptions(
      regionId,
      projectId,
      floatingIp.id,
    ),
    enabled: owned && baseSupport.status !== "unsupported",
  });
  const externalNetworks = useQuery({
    ...externalNetworksQueryOptions(regionId, projectId),
    enabled: owned && baseSupport.status !== "unsupported",
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [description, setDescription] = useState("");
  const [externalPortEnd, setExternalPortEnd] = useState("");
  const [externalPortStart, setExternalPortStart] = useState("");
  const [internalPortEnd, setInternalPortEnd] = useState("");
  const [internalPortStart, setInternalPortStart] = useState("");
  const [portSelection, setPortSelection] = useState("");
  const [protocol, setProtocol] =
    useState<NeutronPortForwardingProtocol>("tcp");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const portOptions = useMemo(
    () =>
      externalNetworks.data
        ? buildFloatingIpPortOptions({
            externalNetworkIds: externalNetworks.data.map(
              (network) => network.id,
            ),
            ports,
          })
        : [],
    [externalNetworks.data, ports],
  );
  const selectedRule =
    dialog?.kind === "edit" || dialog?.kind === "delete" ? dialog.rule : null;
  const rangesAvailable = rangeSupport.status !== "unsupported";
  const descriptionsAvailable = descriptionSupport.status !== "unsupported";

  const resetForm = (rule?: FloatingIpPortForwarding) => {
    const values = rule
      ? rulePortValues(rule)
      : {
          externalStart: "",
          externalEnd: "",
          internalStart: "",
          internalEnd: "",
        };
    setDescription(rule?.description ?? "");
    setExternalPortEnd(values.externalEnd);
    setExternalPortStart(values.externalStart);
    setInternalPortEnd(values.internalEnd);
    setInternalPortStart(values.internalStart);
    setPortSelection(
      rule
        ? floatingIpPortSelectionValue(
            rule.internal_port_id,
            rule.internal_ip_address,
          )
        : (portOptions[0]?.value ?? ""),
    );
    setProtocol(
      NEUTRON_PORT_FORWARDING_PROTOCOLS.includes(
        rule?.protocol as NeutronPortForwardingProtocol,
      )
        ? (rule!.protocol as NeutronPortForwardingProtocol)
        : "tcp",
    );
    setError(null);
  };
  const openCreate = () => {
    resetForm();
    setDialog({ kind: "create" });
  };
  const openEdit = (rule: FloatingIpPortForwarding) => {
    resetForm(rule);
    setDialog({ kind: "edit", rule });
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: [
        regionId,
        projectId,
        "floating-ip-port-forwardings",
        floatingIp.id,
      ],
    });
  };
  const submit = () => {
    const target = parseFloatingIpPortSelection(portSelection);
    if (!target) {
      setError("Select an internal port and fixed IPv4 address.");
      return;
    }
    if (!externalPortStart || !internalPortStart) {
      setError("Enter both the public and internal ports.");
      return;
    }
    const input = {
      description: descriptionsAvailable ? description : undefined,
      externalPortEnd: rangesAvailable
        ? numberValue(externalPortEnd)
        : undefined,
      externalPortStart: Number(externalPortStart),
      internalIpAddress: target.fixedIpAddress,
      internalPortEnd: rangesAvailable
        ? numberValue(internalPortEnd)
        : undefined,
      internalPortId: target.portId,
      internalPortStart: Number(internalPortStart),
      protocol,
    };
    startTransition(async () => {
      const result =
        dialog?.kind === "edit"
          ? await updateFloatingIpPortForwardingAction(
              { projectId, regionId },
              floatingIp.id,
              dialog.rule.id,
              input,
            )
          : await createFloatingIpPortForwardingAction(
              { projectId, regionId },
              floatingIp.id,
              input,
            );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const confirmDelete = () => {
    if (dialog?.kind !== "delete") return;
    startTransition(async () => {
      const result = await deleteFloatingIpPortForwardingAction(
        { projectId, regionId },
        floatingIp.id,
        dialog.rule.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };

  if (baseSupport.status === "unsupported") {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Port forwarding</h3>
        <MutationAlert variant="info" title="Port forwarding unavailable">
          {baseSupport.message}
        </MutationAlert>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Port forwarding</h3>
          <Badge variant="outline">{query.data?.length ?? 0}</Badge>
        </div>
        {owned ? (
          <Button
            variant="outline"
            onClick={openCreate}
            disabled={
              Boolean(floatingIp.port_id) ||
              query.isLoading ||
              externalNetworks.data === undefined
            }
          >
            <Plus className="size-4" />
            Add rule
          </Button>
        ) : null}
      </div>
      {baseSupport.status === "unknown" ? (
        <MutationAlert variant="info" title="Support could not be verified">
          {baseSupport.message}
        </MutationAlert>
      ) : null}
      {!owned ? (
        <MutationAlert variant="info" title="Read-only context">
          Port forwarding rules are shown only for floating IPs owned by the
          active project.
        </MutationAlert>
      ) : null}
      {floatingIp.port_id ? (
        <MutationAlert variant="info" title="Floating IP is associated">
          Disassociate this address before creating port forwarding rules.
        </MutationAlert>
      ) : null}
      {externalNetworks.isError && externalNetworks.data === undefined ? (
        <MutationAlert title="Internal targets could not be loaded">
          Sunrise could not verify which networks are internal. Refresh and try
          again before adding or editing a forwarding rule.
        </MutationAlert>
      ) : null}
      {query.isError ? (
        <MutationAlert title="Port forwarding rules could not be loaded">
          {query.error instanceof Error
            ? query.error.message
            : "Refresh and try again."}
        </MutationAlert>
      ) : query.isLoading ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Loading forwarding rules...
        </div>
      ) : query.data?.length ? (
        <div className="divide-y rounded-md border">
          {query.data.map((rule) => {
            const port = ports.find(
              (candidate) => candidate.id === rule.internal_port_id,
            );
            const targetAvailable = portOptions.some(
              (option) =>
                option.value ===
                floatingIpPortSelectionValue(
                  rule.internal_port_id,
                  rule.internal_ip_address,
                ),
            );
            const rangeUpdateUnavailable =
              !rangesAvailable &&
              (rule.external_port_range != null ||
                rule.internal_port_range != null);
            const editUnavailable =
              externalNetworks.data === undefined ||
              !targetAvailable ||
              rangeUpdateUnavailable;
            return (
              <div
                key={rule.id}
                className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[minmax(8rem,0.7fr)_auto_minmax(14rem,1.4fr)_minmax(10rem,1fr)_auto] lg:items-center"
              >
                <div>
                  <span className="font-medium uppercase">{rule.protocol}</span>
                  <div className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {floatingIp.floating_ip_address}:
                    {portForwardingExternalPorts(rule)}
                  </div>
                </div>
                <ArrowRight className="hidden size-4 text-muted-foreground lg:block" />
                <div className="min-w-0">
                  {port ? (
                    <ResourceLink
                      href={`/networking/ports/${encodeURIComponent(port.id)}`}
                    >
                      {port.name || port.id}
                    </ResourceLink>
                  ) : (
                    <span className="break-all font-mono text-xs">
                      {rule.internal_port_id}
                    </span>
                  )}
                  <div className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {rule.internal_ip_address}:
                    {portForwardingInternalPorts(rule)}
                  </div>
                </div>
                <span className="min-w-0 break-words text-muted-foreground">
                  {rule.description || "No description"}
                </span>
                {owned ? (
                  <div className="flex items-center justify-end">
                    <EditActionButton
                      compact
                      label="Edit forwarding rule"
                      disabled={editUnavailable}
                      title={
                        rangeUpdateUnavailable
                          ? "This cloud does not advertise range updates for this rule"
                          : !targetAvailable
                            ? "The current internal target is no longer eligible"
                            : externalNetworks.data === undefined
                              ? "Wait until internal networks have been checked"
                              : undefined
                      }
                      onClick={() => openEdit(rule)}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      tone="danger"
                      title="Delete forwarding rule"
                      onClick={() => {
                        setError(null);
                        setDialog({ kind: "delete", rule });
                      }}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete forwarding rule</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : owned ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No port forwarding rules are configured.
        </div>
      ) : null}
      <Dialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "edit"
                  ? "Edit forwarding rule"
                  : "Add forwarding rule"}
              </DialogTitle>
              <DialogDescription>
                Forward a public IPv4 port or range to a fixed IPv4 address on a
                project port.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="port-forwarding-protocol">Protocol</Label>
                <Select
                  value={protocol}
                  disabled={pending}
                  onValueChange={(value) =>
                    setProtocol(value as NeutronPortForwardingProtocol)
                  }
                >
                  <SelectTrigger id="port-forwarding-protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEUTRON_PORT_FORWARDING_PROTOCOLS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port-forwarding-target">Internal target</Label>
                <Select
                  value={portSelection}
                  disabled={pending}
                  onValueChange={setPortSelection}
                >
                  <SelectTrigger id="port-forwarding-target">
                    <SelectValue placeholder="Select a port address" />
                  </SelectTrigger>
                  <SelectContent>
                    {portOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        textValue={option.label}
                      >
                        <span
                          className="block max-w-[min(36rem,calc(100vw-7rem))] truncate"
                          title={option.label}
                        >
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                    {portOptions.length === 0 ? (
                      <SelectItem value="unavailable" disabled>
                        No eligible fixed IPv4 addresses
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor="port-forwarding-external-start">
                  Public port{rangesAvailable ? " or range" : ""}
                </Label>
                <div
                  className={
                    rangesAvailable ? "grid grid-cols-2 gap-2" : undefined
                  }
                >
                  <Input
                    id="port-forwarding-external-start"
                    type="number"
                    min={1}
                    max={65_535}
                    required
                    placeholder={rangesAvailable ? "Start" : "Port"}
                    value={externalPortStart}
                    disabled={pending}
                    onChange={(event) =>
                      setExternalPortStart(event.target.value)
                    }
                  />
                  {rangesAvailable ? (
                    <Input
                      aria-label="Public range end"
                      type="number"
                      min={1}
                      max={65_535}
                      placeholder="End (optional)"
                      value={externalPortEnd}
                      disabled={pending}
                      onChange={(event) =>
                        setExternalPortEnd(event.target.value)
                      }
                    />
                  ) : null}
                </div>
              </div>
              <div className="space-y-3">
                <Label htmlFor="port-forwarding-internal-start">
                  Internal port{rangesAvailable ? " or range" : ""}
                </Label>
                <div
                  className={
                    rangesAvailable ? "grid grid-cols-2 gap-2" : undefined
                  }
                >
                  <Input
                    id="port-forwarding-internal-start"
                    type="number"
                    min={1}
                    max={65_535}
                    required
                    placeholder={rangesAvailable ? "Start" : "Port"}
                    value={internalPortStart}
                    disabled={pending}
                    onChange={(event) =>
                      setInternalPortStart(event.target.value)
                    }
                  />
                  {rangesAvailable ? (
                    <Input
                      aria-label="Internal range end"
                      type="number"
                      min={1}
                      max={65_535}
                      placeholder="End (optional)"
                      value={internalPortEnd}
                      disabled={pending}
                      onChange={(event) =>
                        setInternalPortEnd(event.target.value)
                      }
                    />
                  ) : null}
                </div>
              </div>
            </div>
            {rangesAvailable ? (
              <p className="text-xs text-muted-foreground">
                Leave both end values blank for one port. Public ranges may map
                to one internal port or to an equally sized internal range.
              </p>
            ) : null}
            {descriptionsAvailable ? (
              <div className="space-y-1.5">
                <Label htmlFor="port-forwarding-description">Description</Label>
                <Textarea
                  id="port-forwarding-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            ) : null}
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={pending}
                disabled={!portSelection || portOptions.length === 0}
              >
                {dialog?.kind === "edit" ? "Save changes" : "Add rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete forwarding rule?"
        description="Connections through this public port or range will stop immediately."
        confirmLabel="Delete rule"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        {selectedRule ? (
          <div className="rounded-md border px-3 py-2 font-mono text-sm">
            {floatingIp.floating_ip_address}:
            {portForwardingExternalPorts(selectedRule)}
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </section>
  );
}
