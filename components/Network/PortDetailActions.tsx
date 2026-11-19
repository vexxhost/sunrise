"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import {
  AllowedAddressPairsFields,
  type AllowedAddressPairInput,
} from "@/components/Network/AllowedAddressPairsFields";
import { ExtraDhcpOptionsFields } from "@/components/Network/ExtraDhcpOptionsFields";
import {
  changedQosPolicyIdFromSelection,
  QosPolicySelect,
  qosPolicySelection,
} from "@/components/Network/QosPolicySelect";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { Badge } from "@/components/ui/badge";
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
import {
  deletePortAction,
  updatePortAction,
} from "@/lib/openstack/neutron-actions";
import {
  attachPortAction,
  detachPortAction,
} from "@/lib/openstack/nova-actions";
import type { Port, SecurityGroup, Server } from "@/types/openstack";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { qosPoliciesQueryOptions } from "@/hooks/queries/useNetworks";
import {
  diffExtraDhcpOptions,
  portExtraDhcpOptionInputs,
  type ExtraDhcpOptionInput,
} from "@/lib/openstack/neutron-extra-dhcp-options";
import {
  isNeutronPortVnicType,
  NEUTRON_PORT_VNIC_TYPE_OPTIONS,
} from "@/lib/openstack/neutron-port-vnic-types";
import {
  isNeutronPortNumaAffinityPolicy,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS,
} from "@/lib/openstack/neutron-port-placement";

type PortDialog = "attach" | "delete" | "detach" | "edit" | null;
const PORT_SETTING_DEFAULT = "__cloud_default__";
const PORT_TRUSTED = "trusted";
const PORT_NOT_TRUSTED = "not-trusted";

function trustedVifSelection(value: boolean | null | undefined) {
  if (value === true) return PORT_TRUSTED;
  if (value === false) return PORT_NOT_TRUSTED;
  return PORT_SETTING_DEFAULT;
}

function sameStringSet(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

interface PortDetailActionsProps {
  allowedAddressPairsSupport: OpenStackFeatureSupport;
  dnsDomainPortsSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  extraDhcpOptionsSupport: OpenStackFeatureSupport;
  groups: SecurityGroup[];
  numaAffinitySupport: OpenStackFeatureSupport;
  numaSocketSupport: OpenStackFeatureSupport;
  port: Port;
  portBindingSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  projectId: string;
  regionId: string;
  securityGroupSupport: OpenStackFeatureSupport;
  servers: Server[];
  trustedVifSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationUpdateSupport: OpenStackFeatureSupport;
}

export function PortDetailActions({
  allowedAddressPairsSupport,
  dnsDomainPortsSupport,
  dnsIntegrationSupport,
  extraDhcpOptionsSupport,
  groups,
  numaAffinitySupport,
  numaSocketSupport,
  port,
  portBindingSupport,
  portSecuritySupport,
  qosSupport,
  projectId,
  regionId,
  securityGroupSupport,
  servers,
  trustedVifSupport,
  uplinkStatusPropagationSupport,
  uplinkStatusPropagationUpdateSupport,
}: PortDetailActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<PortDialog>(null);
  const [name, setName] = useState(port.name);
  const [description, setDescription] = useState(port.description);
  const [dnsDomain, setDnsDomain] = useState(port.dns_domain ?? "");
  const [dnsName, setDnsName] = useState(port.dns_name ?? "");
  const [adminStateUp, setAdminStateUp] = useState(port.admin_state_up);
  const [vnicType, setVnicType] = useState(
    port["binding:vnic_type"] ?? "normal",
  );
  const [numaAffinityPolicy, setNumaAffinityPolicy] = useState(
    port.numa_affinity_policy ?? PORT_SETTING_DEFAULT,
  );
  const [trustedVif, setTrustedVif] = useState(
    trustedVifSelection(port.trusted),
  );
  const [propagateUplinkStatus, setPropagateUplinkStatus] = useState(
    port.propagate_uplink_status ?? true,
  );
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(
    port.port_security_enabled,
  );
  const [securityGroupIds, setSecurityGroupIds] = useState(
    port.security_groups,
  );
  const [allowedAddressPairs, setAllowedAddressPairs] = useState<
    AllowedAddressPairInput[]
  >(
    (port.allowed_address_pairs ?? []).map((pair) => ({
      ipAddress: pair.ip_address,
      macAddress: pair.mac_address ?? "",
    })),
  );
  const [extraDhcpOptions, setExtraDhcpOptions] = useState<
    ExtraDhcpOptionInput[]
  >(portExtraDhcpOptionInputs(port.extra_dhcp_opts));
  const [qosPolicySelectionValue, setQosPolicySelectionValue] = useState(
    qosPolicySelection(port.qos_policy_id),
  );
  const [serverId, setServerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const portSecurityAvailable = portSecuritySupport.status !== "unsupported";
  const dnsIntegrationAvailable =
    dnsIntegrationSupport.status !== "unsupported";
  const dnsDomainPortsAvailable =
    dnsIntegrationAvailable && dnsDomainPortsSupport.status !== "unsupported";
  const securityGroupsAvailable = securityGroupSupport.status !== "unsupported";
  const allowedAddressPairsAvailable =
    allowedAddressPairsSupport.status !== "unsupported";
  const extraDhcpOptionsAvailable =
    extraDhcpOptionsSupport.status !== "unsupported";
  const qosAvailable = qosSupport.status !== "unsupported";
  const numaAffinityAvailable = numaAffinitySupport.status !== "unsupported";
  const numaSocketAvailable = numaSocketSupport.status !== "unsupported";
  const portBindingAvailable = portBindingSupport.status !== "unsupported";
  const trustedVifAvailable = trustedVifSupport.status !== "unsupported";
  const uplinkStatusPropagationAvailable =
    uplinkStatusPropagationSupport.status !== "unsupported";
  const uplinkStatusPropagationUpdatable =
    uplinkStatusPropagationAvailable &&
    uplinkStatusPropagationUpdateSupport.status !== "unsupported";
  const uplinkStatusPropagationUnavailableMessage =
    uplinkStatusPropagationAvailable
      ? uplinkStatusPropagationUpdateSupport.message
      : uplinkStatusPropagationSupport.message;
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled: dialog === "edit" && qosAvailable,
  });

  const computeAttached =
    port.device_owner.startsWith("compute:") && Boolean(port.device_id);
  const infrastructureManaged = Boolean(port.device_owner) && !computeAttached;
  const portBound = computeAttached || Boolean(port["binding:host_id"]);

  if (infrastructureManaged) {
    return <Badge variant="outline">Managed by OpenStack</Badge>;
  }

  const open = (next: Exclude<PortDialog, null>) => {
    setError(null);
    if (next === "edit") {
      setName(port.name);
      setDescription(port.description);
      setDnsDomain(port.dns_domain ?? "");
      setDnsName(port.dns_name ?? "");
      setAdminStateUp(port.admin_state_up);
      setVnicType(port["binding:vnic_type"] ?? "normal");
      setNumaAffinityPolicy(port.numa_affinity_policy ?? PORT_SETTING_DEFAULT);
      setTrustedVif(trustedVifSelection(port.trusted));
      setPropagateUplinkStatus(port.propagate_uplink_status ?? true);
      setPortSecurityEnabled(port.port_security_enabled);
      setSecurityGroupIds(port.security_groups);
      setAllowedAddressPairs(
        (port.allowed_address_pairs ?? []).map((pair) => ({
          ipAddress: pair.ip_address,
          macAddress: pair.mac_address ?? "",
        })),
      );
      setExtraDhcpOptions(portExtraDhcpOptionInputs(port.extra_dhcp_opts));
      setQosPolicySelectionValue(qosPolicySelection(port.qos_policy_id));
    }
    if (next === "attach") setServerId("");
    setDialog(next);
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const originalAllowedAddressPairs = (
        port.allowed_address_pairs ?? []
      ).map((pair) => ({
        ipAddress: pair.ip_address,
        macAddress: pair.mac_address ?? "",
      }));
      const allowedAddressPairsChanged =
        JSON.stringify(allowedAddressPairs) !==
        JSON.stringify(originalAllowedAddressPairs);
      const extraDhcpOptionsPatch = extraDhcpOptionsAvailable
        ? diffExtraDhcpOptions(
            extraDhcpOptions,
            portExtraDhcpOptionInputs(port.extra_dhcp_opts),
          )
        : undefined;
      const portSecurityChanged =
        portSecurityAvailable &&
        portSecurityEnabled !== port.port_security_enabled;
      const securityGroupsChanged =
        securityGroupsAvailable &&
        !sameStringSet(securityGroupIds, port.security_groups);
      const dnsNameChanged =
        dnsIntegrationAvailable && dnsName !== (port.dns_name ?? "");
      const dnsDomainChanged =
        dnsDomainPortsAvailable && dnsDomain !== (port.dns_domain ?? "");
      const propagateUplinkStatusChanged =
        uplinkStatusPropagationUpdatable &&
        propagateUplinkStatus !== (port.propagate_uplink_status ?? true);
      const vnicTypeChanged =
        portBindingAvailable &&
        !portBound &&
        vnicType !== (port["binding:vnic_type"] ?? "normal");
      const numaAffinityChanged =
        numaAffinityAvailable &&
        numaAffinityPolicy !==
          (port.numa_affinity_policy ?? PORT_SETTING_DEFAULT);
      const trustedVifChanged =
        trustedVifAvailable && trustedVif !== trustedVifSelection(port.trusted);
      const result = await updatePortAction({ projectId, regionId }, port.id, {
        name,
        description,
        dnsName: dnsNameChanged ? dnsName : undefined,
        dnsDomain: dnsDomainChanged ? dnsDomain : undefined,
        adminStateUp,
        vnicType:
          vnicTypeChanged && isNeutronPortVnicType(vnicType)
            ? vnicType
            : undefined,
        numaAffinityPolicy: numaAffinityChanged
          ? numaAffinityPolicy === PORT_SETTING_DEFAULT
            ? null
            : isNeutronPortNumaAffinityPolicy(numaAffinityPolicy)
              ? numaAffinityPolicy
              : undefined
          : undefined,
        trusted: trustedVifChanged
          ? trustedVif === PORT_TRUSTED
            ? true
            : trustedVif === PORT_NOT_TRUSTED
              ? false
              : undefined
          : undefined,
        propagateUplinkStatus: propagateUplinkStatusChanged
          ? propagateUplinkStatus
          : undefined,
        portSecurityEnabled: portSecurityChanged
          ? portSecurityEnabled
          : undefined,
        securityGroupIds: securityGroupsChanged
          ? portSecurityAvailable && !portSecurityEnabled
            ? []
            : securityGroupIds
          : undefined,
        allowedAddressPairs:
          allowedAddressPairsAvailable && allowedAddressPairsChanged
            ? allowedAddressPairs
            : undefined,
        extraDhcpOptions: extraDhcpOptionsPatch,
        qosPolicyId: qosAvailable
          ? changedQosPolicyIdFromSelection(
              qosPolicySelectionValue,
              port.qos_policy_id,
            )
          : undefined,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };

  const submitAttach = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await attachPortAction(
        { projectId, regionId },
        { portId: port.id, serverId },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };

  const confirmDetach = () => {
    startTransition(async () => {
      const result = await detachPortAction(
        { projectId, regionId },
        { portId: port.id, serverId: port.device_id },
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
    startTransition(async () => {
      const result = await deletePortAction({ projectId, regionId }, port.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/networking/ports");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {computeAttached ? (
          <Button variant="outline" onClick={() => open("detach")}>
            <Link2Off className="size-4" /> Detach
          </Button>
        ) : (
          <Button onClick={() => open("attach")}>
            <Link2 className="size-4" /> Attach to instance
          </Button>
        )}
        <EditActionButton label="Edit port" onClick={() => open("edit")} />
        {!computeAttached ? (
          <Button
            variant="outline"
            onClick={() => open("delete")}
            tone="danger"
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : null}
      </div>

      <Dialog
        open={dialog === "attach"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitAttach}>
            <DialogHeader>
              <DialogTitle>Attach port to instance</DialogTitle>
              <DialogDescription>
                Nova will add this existing Neutron port as a new interface.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="port-instance">Instance</Label>
              <Select
                value={serverId}
                disabled={pending}
                onValueChange={setServerId}
              >
                <SelectTrigger id="port-instance">
                  <SelectValue placeholder="Select an instance" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name || server.id} · {server.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {servers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project instances are available.
              </p>
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
              <Button type="submit" disabled={pending || !serverId}>
                {pending ? "Attaching" : "Attach port"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit port</DialogTitle>
              <DialogDescription>
                Update the interface label, DNS identity, DHCP options, state,
                and security policy.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-port-name">Name</Label>
                <Input
                  id="edit-port-name"
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-port-description">Description</Label>
                <Textarea
                  id="edit-port-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {dnsIntegrationAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-port-dns-name">DNS name</Label>
                  <Input
                    id="edit-port-dns-name"
                    maxLength={255}
                    placeholder="api"
                    value={dnsName}
                    disabled={pending}
                    onChange={(event) => setDnsName(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Host name published for this port.
                  </p>
                </div>
              ) : null}
              {dnsDomainPortsAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-port-dns-domain">DNS domain</Label>
                  <Input
                    id="edit-port-dns-domain"
                    maxLength={255}
                    placeholder="apps.example.org."
                    value={dnsDomain}
                    disabled={pending}
                    onChange={(event) => setDnsDomain(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Per-port domain including the trailing dot.
                  </p>
                </div>
              ) : null}
              {qosAvailable ? (
                <div className="sm:col-span-2">
                  <QosPolicySelect
                    description="A direct policy overrides the policy inherited from the network."
                    disabled={pending}
                    emptyLabel="Use network policy"
                    error={qosPolicies.isError}
                    id="edit-port-qos-policy"
                    loading={qosPolicies.isLoading}
                    onValueChange={setQosPolicySelectionValue}
                    policies={qosPolicies.data ?? []}
                    value={qosPolicySelectionValue}
                  />
                </div>
              ) : null}
              {portBindingAvailable ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-port-vnic-type">vNIC type</Label>
                  <Select
                    value={vnicType}
                    disabled={pending || portBound}
                    onValueChange={setVnicType}
                  >
                    <SelectTrigger id="edit-port-vnic-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!isNeutronPortVnicType(vnicType) ? (
                        <SelectItem value={vnicType}>
                          {vnicType} (reported by Neutron)
                        </SelectItem>
                      ) : null}
                      {NEUTRON_PORT_VNIC_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {portBound
                      ? "Detach this port before changing its vNIC type."
                      : `${
                          NEUTRON_PORT_VNIC_TYPE_OPTIONS.find(
                            (option) => option.value === vnicType,
                          )?.description ?? "Value reported by Neutron"
                        }. Availability depends on the network backend and compute hosts.`}
                  </p>
                </div>
              ) : null}
              {numaAffinityAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-port-numa-affinity">NUMA affinity</Label>
                  <Select
                    value={numaAffinityPolicy}
                    disabled={pending}
                    onValueChange={setNumaAffinityPolicy}
                  >
                    <SelectTrigger id="edit-port-numa-affinity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PORT_SETTING_DEFAULT}>
                        Cloud default
                      </SelectItem>
                      {numaAffinityPolicy !== PORT_SETTING_DEFAULT &&
                      !isNeutronPortNumaAffinityPolicy(numaAffinityPolicy) ? (
                        <SelectItem value={numaAffinityPolicy}>
                          {numaAffinityPolicy} (reported by Neutron)
                        </SelectItem>
                      ) : null}
                      {NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS.filter(
                        (option) =>
                          option.value !== "socket" ||
                          numaSocketAvailable ||
                          numaAffinityPolicy === "socket",
                      ).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS.find(
                      (option) => option.value === numaAffinityPolicy,
                    )?.description ??
                      "Used when Nova next schedules a server with this port."}
                  </p>
                </div>
              ) : null}
              {trustedVifAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-port-trusted-vif">Trusted VIF</Label>
                  <Select
                    value={trustedVif}
                    disabled={pending}
                    onValueChange={setTrustedVif}
                  >
                    <SelectTrigger id="edit-port-trusted-vif">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {port.trusted == null ? (
                        <SelectItem value={PORT_SETTING_DEFAULT}>
                          Not configured
                        </SelectItem>
                      ) : null}
                      <SelectItem value={PORT_TRUSTED}>Trusted</SelectItem>
                      <SelectItem value={PORT_NOT_TRUSTED}>
                        Not trusted
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Neutron policy commonly restricts this setting to
                    administrators.
                  </p>
                </div>
              ) : null}
              <label
                className={`flex items-start gap-3 rounded-md border p-3${portSecurityAvailable ? "" : " sm:col-span-2"}`}
              >
                <Checkbox
                  checked={adminStateUp}
                  disabled={pending}
                  onCheckedChange={(value) => setAdminStateUp(value === true)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Admin state up
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Allow traffic when attached.
                  </span>
                </span>
              </label>
              {uplinkStatusPropagationUpdatable ? (
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={propagateUplinkStatus}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      setPropagateUplinkStatus(value === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Propagate uplink status
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Make the virtual interface link state follow its physical
                      uplink, including SR-IOV ports.
                    </span>
                  </span>
                </label>
              ) : null}
              {portSecurityAvailable ? (
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={portSecurityEnabled}
                    disabled={pending}
                    onCheckedChange={(value) => {
                      const checked = value === true;
                      setPortSecurityEnabled(checked);
                      if (!checked) {
                        setSecurityGroupIds([]);
                        setAllowedAddressPairs([]);
                      }
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Port security
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Apply anti-spoofing and security groups.
                    </span>
                  </span>
                </label>
              ) : null}
              {securityGroupsAvailable &&
              (!portSecurityAvailable || portSecurityEnabled) ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Security groups</Label>
                  <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                    {groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={securityGroupIds.includes(group.id)}
                          disabled={pending}
                          onCheckedChange={(checked) =>
                            setSecurityGroupIds((current) =>
                              checked === true
                                ? [...current, group.id]
                                : current.filter((id) => id !== group.id),
                            )
                          }
                        />
                        <span className="truncate">
                          {group.name || group.id}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {allowedAddressPairsAvailable ? (
                <AllowedAddressPairsFields
                  disabled={pending}
                  idPrefix="edit-port"
                  onValueChange={setAllowedAddressPairs}
                  portSecurityEnabled={
                    !portSecurityAvailable || portSecurityEnabled
                  }
                  value={allowedAddressPairs}
                />
              ) : null}
              {extraDhcpOptionsAvailable ? (
                <ExtraDhcpOptionsFields
                  disabled={pending}
                  idPrefix="edit-port"
                  onValueChange={setExtraDhcpOptions}
                  value={extraDhcpOptions}
                />
              ) : null}
            </div>
            {!portSecurityAvailable ||
            !securityGroupsAvailable ||
            !allowedAddressPairsAvailable ||
            !extraDhcpOptionsAvailable ||
            !dnsIntegrationAvailable ||
            !dnsDomainPortsAvailable ||
            !qosAvailable ||
            !numaAffinityAvailable ||
            !portBindingAvailable ||
            !trustedVifAvailable ||
            !uplinkStatusPropagationUpdatable ? (
              <MutationAlert
                variant="info"
                title="Some port controls are unavailable"
              >
                {!portSecurityAvailable ? (
                  <p>{portSecuritySupport.message}</p>
                ) : null}
                {!securityGroupsAvailable ? (
                  <p>{securityGroupSupport.message}</p>
                ) : null}
                {!allowedAddressPairsAvailable ? (
                  <p>{allowedAddressPairsSupport.message}</p>
                ) : null}
                {!extraDhcpOptionsAvailable ? (
                  <p>{extraDhcpOptionsSupport.message}</p>
                ) : null}
                {!dnsIntegrationAvailable ? (
                  <p>{dnsIntegrationSupport.message}</p>
                ) : null}
                {dnsIntegrationAvailable && !dnsDomainPortsAvailable ? (
                  <p>{dnsDomainPortsSupport.message}</p>
                ) : null}
                {!qosAvailable ? <p>{qosSupport.message}</p> : null}
                {!numaAffinityAvailable ? (
                  <p>{numaAffinitySupport.message}</p>
                ) : null}
                {!portBindingAvailable ? (
                  <p>{portBindingSupport.message}</p>
                ) : null}
                {!trustedVifAvailable ? (
                  <p>{trustedVifSupport.message}</p>
                ) : null}
                {!uplinkStatusPropagationUpdatable ? (
                  <p>{uplinkStatusPropagationUnavailableMessage}</p>
                ) : null}
              </MutationAlert>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={dialog === "detach"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Detach interface?"
        description="The instance will lose this network interface and its fixed addresses until the port is attached again."
        confirmLabel="Detach port"
        pendingLabel="Detaching"
        pending={pending}
        error={error}
        onConfirm={confirmDetach}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {port.name || port.id}
        </div>
      </MutationConfirmationDialog>

      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete port?"
        description="The reserved fixed addresses and port configuration will be permanently removed."
        confirmLabel="Delete port"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {port.name || port.id}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
