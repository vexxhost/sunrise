"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EthernetPort,
  Globe2,
  Network,
  Plus,
  Router,
  ShieldCheck,
} from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import {
  AllowedAddressPairsFields,
  type AllowedAddressPairInput,
} from "@/components/Network/AllowedAddressPairsFields";
import { ExtraDhcpOptionsFields } from "@/components/Network/ExtraDhcpOptionsFields";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import {
  QOS_POLICY_CLOUD_DEFAULT,
  QOS_POLICY_NONE,
  QosPolicySelect,
  optionalQosPolicyIdFromSelection,
} from "@/components/Network/QosPolicySelect";
import { AvailabilityZoneMultiSelect } from "@/components/OpenStack/AvailabilityZoneSelect";
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
  defaultSecurityGroupRulesQueryOptions,
  availableNetworkZoneNames,
  externalNetworksQueryOptions,
  networkAvailabilityZonesQueryOptions,
  networksQueryOptions,
  portsQueryOptions,
  qosPoliciesQueryOptions,
  securityGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import {
  createFloatingIpAction,
  createNetworkAction,
  createPortAction,
  createRouterAction,
  createSecurityGroupAction,
} from "@/lib/openstack/neutron-actions";
import {
  buildFloatingIpPortOptions,
  parseFloatingIpPortSelection,
} from "@/lib/openstack/neutron-floating-ip";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import type { ExtraDhcpOptionInput } from "@/lib/openstack/neutron-extra-dhcp-options";
import { routerCapabilityBooleanInput } from "@/lib/openstack/neutron-router-gateways";
import {
  isNeutronPortHardwareOffloadType,
  isNeutronPortNumaAffinityPolicy,
  NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS,
} from "@/lib/openstack/neutron-port-placement";
import {
  NEUTRON_PORT_VNIC_TYPE_OPTIONS,
  type NeutronPortVnicType,
} from "@/lib/openstack/neutron-port-vnic-types";
import { cn } from "@/lib/utils";

interface ScopeProps {
  initiallyOpen?: boolean;
  projectId: string;
  regionId: string;
}

const PORT_SETTING_DEFAULT = "__cloud_default__";
const PORT_TRUSTED = "trusted";
const PORT_NOT_TRUSTED = "not-trusted";

function availabilityZoneHints(value: string) {
  const hints = value
    .split(",")
    .map((zone) => zone.trim())
    .filter(Boolean);
  return hints.length ? [...new Set(hints)] : undefined;
}

function AvailabilityZoneHintsField({
  disabled,
  loading,
  onValueChange,
  value,
  zones,
}: {
  disabled: boolean;
  loading: boolean;
  onValueChange: (value: string) => void;
  value: string;
  zones: string[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Availability zone hints</p>
      <AvailabilityZoneMultiSelect
        disabled={disabled || loading}
        onValueChange={onValueChange}
        value={value}
        zones={zones}
      />
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Loading available zones."
          : zones.length
            ? "Optionally ask the cloud scheduler to place this resource in one of the selected zones."
            : "No available zones were advertised. The cloud scheduler will choose placement."}
      </p>
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  return error ? <MutationAlert>{error}</MutationAlert> : null;
}

function ToggleField({
  checked,
  className,
  disabled,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  disabled: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn("flex items-start gap-3 rounded-md border p-3", className)}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function CreateNetworkAction({
  availabilityZoneSupport,
  dnsIntegrationSupport,
  initiallyOpen = false,
  mtuSupport,
  projectId,
  regionId,
  portSecuritySupport,
  qosSupport,
  vlanTransparencySupport,
}: ScopeProps & {
  availabilityZoneSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  mtuSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  vlanTransparencySupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dnsDomain, setDnsDomain] = useState("");
  const [mtu, setMtu] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [selectedAvailabilityZones, setSelectedAvailabilityZones] =
    useState("");
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
  const [vlanTransparent, setVlanTransparent] = useState(false);
  const [qosPolicySelection, setQosPolicySelection] = useState(
    QOS_POLICY_CLOUD_DEFAULT,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const portSecurityAvailable = portSecuritySupport.status !== "unsupported";
  const dnsIntegrationAvailable =
    dnsIntegrationSupport.status !== "unsupported";
  const availabilityZonesAvailable =
    availabilityZoneSupport.status !== "unsupported";
  const qosAvailable = qosSupport.status !== "unsupported";
  const mtuWritable = mtuSupport.status !== "unsupported";
  const vlanTransparencyAvailable =
    vlanTransparencySupport.status !== "unsupported";
  const availabilityZones = useQuery({
    ...networkAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && availabilityZonesAvailable,
  });
  const networkZones = useMemo(
    () => availableNetworkZoneNames(availabilityZones.data ?? [], "network"),
    [availabilityZones.data],
  );
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled: open && qosAvailable,
  });
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "network", requested: 1 }],
    serviceId: "network",
  });

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) clearCreateActionIntent();
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setDnsDomain("");
      setMtu("");
      setAdminStateUp(true);
      setSelectedAvailabilityZones("");
      setPortSecurityEnabled(true);
      setVlanTransparent(false);
      setQosPolicySelection(QOS_POLICY_CLOUD_DEFAULT);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createNetworkAction(
        { projectId, regionId },
        {
          name,
          description,
          dnsDomain:
            dnsIntegrationAvailable && dnsDomain.trim() ? dnsDomain : undefined,
          adminStateUp,
          availabilityZoneHints: availabilityZoneHints(
            selectedAvailabilityZones,
          ),
          portSecurityEnabled: portSecurityAvailable
            ? portSecurityEnabled
            : undefined,
          qosPolicyId: qosAvailable
            ? optionalQosPolicyIdFromSelection(qosPolicySelection)
            : undefined,
          mtu: mtuWritable && mtu.trim() ? Number(mtu) : undefined,
          vlanTransparent:
            vlanTransparencyAvailable && vlanTransparent ? true : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" /> Create network
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Network className="size-5" />
                Create network
              </DialogTitle>
              <DialogDescription>
                Create an isolated layer 2 network. Add address space from its
                detail view.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="network-name">Name</Label>
                <Input
                  id="network-name"
                  autoFocus
                  required
                  maxLength={255}
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="network-description">Description</Label>
                <Textarea
                  id="network-description"
                  maxLength={1024}
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {dnsIntegrationAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="network-dns-domain">DNS domain</Label>
                  <Input
                    id="network-dns-domain"
                    maxLength={255}
                    placeholder="apps.example.org."
                    value={dnsDomain}
                    disabled={pending}
                    onChange={(event) => setDnsDomain(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional fully qualified domain. Include the trailing dot.
                  </p>
                </div>
              ) : null}
              {availabilityZonesAvailable ? (
                <AvailabilityZoneHintsField
                  disabled={pending}
                  loading={availabilityZones.isPending}
                  onValueChange={setSelectedAvailabilityZones}
                  value={selectedAvailabilityZones}
                  zones={networkZones}
                />
              ) : null}
              {mtuWritable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="network-mtu">MTU</Label>
                  <Input
                    id="network-mtu"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="Cloud default"
                    value={mtu}
                    disabled={pending}
                    onChange={(event) => setMtu(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the MTU selected by the cloud.
                  </p>
                </div>
              ) : null}
              {qosAvailable ? (
                <QosPolicySelect
                  description="Use the project's cloud default or attach a visible policy."
                  disabled={pending}
                  emptyLabel="Cloud default"
                  emptyValue={QOS_POLICY_CLOUD_DEFAULT}
                  error={qosPolicies.isError}
                  id="network-qos-policy"
                  loading={qosPolicies.isLoading}
                  onValueChange={setQosPolicySelection}
                  policies={qosPolicies.data ?? []}
                  value={qosPolicySelection}
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleField
                  id="network-admin-state"
                  className={
                    portSecurityAvailable || vlanTransparencyAvailable
                      ? undefined
                      : "sm:col-span-2"
                  }
                  label="Admin state up"
                  description="Allow the network to forward traffic."
                  checked={adminStateUp}
                  disabled={pending}
                  onCheckedChange={setAdminStateUp}
                />
                {portSecurityAvailable ? (
                  <ToggleField
                    id="network-port-security"
                    label="Port security"
                    description="Apply anti-spoofing and security groups."
                    checked={portSecurityEnabled}
                    disabled={pending}
                    onCheckedChange={setPortSecurityEnabled}
                  />
                ) : null}
                {vlanTransparencyAvailable ? (
                  <ToggleField
                    id="network-vlan-transparent"
                    label="VLAN transparent"
                    description="Allow VLAN-tagged traffic to pass through this network."
                    checked={vlanTransparent}
                    disabled={pending}
                    onCheckedChange={setVlanTransparent}
                  />
                ) : null}
              </div>
            </div>
            {!portSecurityAvailable ? (
              <MutationAlert
                variant="info"
                title="Port security controls unavailable"
              >
                {portSecuritySupport.message}
              </MutationAlert>
            ) : null}
            {!availabilityZonesAvailable ? (
              <MutationAlert
                variant="info"
                title="Availability-zone hints unavailable"
              >
                {availabilityZoneSupport.message}
              </MutationAlert>
            ) : null}
            {!dnsIntegrationAvailable ? (
              <MutationAlert variant="info" title="DNS integration unavailable">
                {dnsIntegrationSupport.message}
              </MutationAlert>
            ) : null}
            {!qosAvailable ? (
              <MutationAlert variant="info" title="QoS policies unavailable">
                {qosSupport.message}
              </MutationAlert>
            ) : null}
            {!mtuWritable ? (
              <MutationAlert
                variant="info"
                title="MTU configuration unavailable"
              >
                {mtuSupport.message}
              </MutationAlert>
            ) : null}
            {!vlanTransparencyAvailable ? (
              <MutationAlert
                variant="info"
                title="VLAN transparency unavailable"
              >
                {vlanTransparencySupport.message}
              </MutationAlert>
            ) : null}
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
            <FormError error={error} />
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !name.trim() || quota.issues.length > 0}
              >
                {pending ? "Creating" : "Create network"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateRouterAction({
  availabilityZoneSupport,
  canManageAdminOnlyRouterSettings,
  defaultRouteBfdSupport,
  defaultRouteEcmpSupport,
  initiallyOpen = false,
  projectId,
  regionId,
}: ScopeProps & {
  availabilityZoneSupport: OpenStackFeatureSupport;
  canManageAdminOnlyRouterSettings: boolean;
  defaultRouteBfdSupport: OpenStackFeatureSupport;
  defaultRouteEcmpSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [enableDefaultRouteBfd, setEnableDefaultRouteBfd] = useState(false);
  const [enableDefaultRouteEcmp, setEnableDefaultRouteEcmp] = useState(false);
  const [selectedAvailabilityZones, setSelectedAvailabilityZones] =
    useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const availabilityZonesAvailable =
    availabilityZoneSupport.status !== "unsupported";
  const defaultRouteBfdAvailable =
    canManageAdminOnlyRouterSettings &&
    defaultRouteBfdSupport.status !== "unsupported";
  const defaultRouteEcmpAvailable =
    canManageAdminOnlyRouterSettings &&
    defaultRouteEcmpSupport.status !== "unsupported";
  const availabilityZones = useQuery({
    ...networkAvailabilityZonesQueryOptions(regionId, projectId),
    enabled: open && availabilityZonesAvailable,
  });
  const routerZones = useMemo(
    () => availableNetworkZoneNames(availabilityZones.data ?? [], "router"),
    [availabilityZones.data],
  );
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "router", requested: 1 }],
    serviceId: "network",
  });
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) clearCreateActionIntent();
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setAdminStateUp(true);
      setEnableDefaultRouteBfd(false);
      setEnableDefaultRouteEcmp(false);
      setSelectedAvailabilityZones("");
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createRouterAction(
        { projectId, regionId },
        {
          name,
          description,
          adminStateUp,
          enableDefaultRouteBfd: routerCapabilityBooleanInput(
            defaultRouteBfdSupport,
            enableDefaultRouteBfd,
            canManageAdminOnlyRouterSettings,
          ),
          enableDefaultRouteEcmp: routerCapabilityBooleanInput(
            defaultRouteEcmpSupport,
            enableDefaultRouteEcmp,
            canManageAdminOnlyRouterSettings,
          ),
          availabilityZoneHints: availabilityZoneHints(
            selectedAvailabilityZones,
          ),
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create router
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Router className="size-5" />
                Create router
              </DialogTitle>
              <DialogDescription>
                Connect project subnets and optionally provide an external
                gateway.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="router-name">Name</Label>
                <Input
                  id="router-name"
                  autoFocus
                  required
                  maxLength={255}
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="router-description">Description</Label>
                <Textarea
                  id="router-description"
                  maxLength={1024}
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {availabilityZonesAvailable ? (
                <AvailabilityZoneHintsField
                  disabled={pending}
                  loading={availabilityZones.isPending}
                  onValueChange={setSelectedAvailabilityZones}
                  value={selectedAvailabilityZones}
                  zones={routerZones}
                />
              ) : null}
              <ToggleField
                id="router-admin-state"
                label="Admin state up"
                description="Make the router available after creation."
                checked={adminStateUp}
                disabled={pending}
                onCheckedChange={setAdminStateUp}
              />
              {defaultRouteEcmpAvailable ? (
                <ToggleField
                  id="router-default-route-ecmp"
                  label="Default-route ECMP"
                  description="Use equal-cost paths when this router has multiple external gateways."
                  checked={enableDefaultRouteEcmp}
                  disabled={pending}
                  onCheckedChange={setEnableDefaultRouteEcmp}
                />
              ) : null}
              {defaultRouteBfdAvailable ? (
                <ToggleField
                  id="router-default-route-bfd"
                  label="Default-route BFD"
                  description="Monitor external gateway paths with bidirectional forwarding detection."
                  checked={enableDefaultRouteBfd}
                  disabled={pending}
                  onCheckedChange={setEnableDefaultRouteBfd}
                />
              ) : null}
              {!canManageAdminOnlyRouterSettings &&
              (defaultRouteBfdSupport.status !== "unsupported" ||
                defaultRouteEcmpSupport.status !== "unsupported") ? (
                <MutationAlert
                  variant="info"
                  title="Advanced routing settings are read-only"
                >
                  Neutron&apos;s default policy requires the admin role to set
                  default-route ECMP or BFD. Sunrise omits these attributes for
                  the current project token.
                </MutationAlert>
              ) : null}
            </div>
            {!availabilityZonesAvailable ? (
              <MutationAlert
                variant="info"
                title="Availability-zone hints unavailable"
              >
                {availabilityZoneSupport.message}
              </MutationAlert>
            ) : null}
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
            <FormError error={error} />
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !name.trim() || quota.issues.length > 0}
              >
                {pending ? "Creating" : "Create router"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreatePortAction({
  allowedAddressPairsSupport,
  dnsDomainPortsSupport,
  dnsIntegrationSupport,
  extraDhcpOptionsSupport,
  hardwareOffloadSupport,
  initiallyOpen = false,
  numaAffinitySupport,
  numaSocketSupport,
  projectId,
  regionId,
  portBindingSupport,
  portSecuritySupport,
  qosSupport,
  securityGroupSupport,
  trustedVifSupport,
  uplinkStatusPropagationSupport,
}: ScopeProps & {
  allowedAddressPairsSupport: OpenStackFeatureSupport;
  dnsDomainPortsSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  extraDhcpOptionsSupport: OpenStackFeatureSupport;
  hardwareOffloadSupport: OpenStackFeatureSupport;
  numaAffinitySupport: OpenStackFeatureSupport;
  numaSocketSupport: OpenStackFeatureSupport;
  portBindingSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  securityGroupSupport: OpenStackFeatureSupport;
  trustedVifSupport: OpenStackFeatureSupport;
  uplinkStatusPropagationSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsName, setDnsName] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [vnicType, setVnicType] = useState<NeutronPortVnicType>("normal");
  const [hardwareOffloadType, setHardwareOffloadType] =
    useState(PORT_SETTING_DEFAULT);
  const [numaAffinityPolicy, setNumaAffinityPolicy] =
    useState(PORT_SETTING_DEFAULT);
  const [trustedVif, setTrustedVif] = useState(PORT_SETTING_DEFAULT);
  const [propagateUplinkStatus, setPropagateUplinkStatus] = useState(true);
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
  const [securityGroupIds, setSecurityGroupIds] = useState<string[]>([]);
  const [allowedAddressPairs, setAllowedAddressPairs] = useState<
    AllowedAddressPairInput[]
  >([]);
  const [extraDhcpOptions, setExtraDhcpOptions] = useState<
    ExtraDhcpOptionInput[]
  >([]);
  const [qosPolicySelection, setQosPolicySelection] = useState(QOS_POLICY_NONE);
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
  const portBindingAvailable = portBindingSupport.status !== "unsupported";
  const hardwareOffloadAvailable =
    hardwareOffloadSupport.status !== "unsupported" && portBindingAvailable;
  const numaAffinityAvailable = numaAffinitySupport.status !== "unsupported";
  const numaSocketAvailable = numaSocketSupport.status !== "unsupported";
  const trustedVifAvailable =
    trustedVifSupport.status !== "unsupported" && portBindingAvailable;
  const uplinkStatusPropagationAvailable =
    uplinkStatusPropagationSupport.status !== "unsupported";
  const hardwareOffloadUnavailableMessage =
    hardwareOffloadSupport.status === "unsupported"
      ? hardwareOffloadSupport.message
      : "Port hardware offload requires support for Neutron port bindings.";
  const trustedVifUnavailableMessage =
    trustedVifSupport.status === "unsupported"
      ? trustedVifSupport.message
      : "Trusted virtual interfaces require support for Neutron port bindings.";
  const switchdevOffloadSelected = hardwareOffloadType === "switchdev";
  const trustedVifSelected = trustedVif === PORT_TRUSTED;
  const directVnicRequired = switchdevOffloadSelected || trustedVifSelected;
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "port", requested: 1 }],
    serviceId: "network",
  });
  const networks = useQuery({
    ...networksQueryOptions(regionId, projectId),
    enabled: open,
  });
  const groups = useQuery({
    ...securityGroupsQueryOptions(regionId, projectId),
    enabled: open && securityGroupsAvailable,
  });
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled: open && qosAvailable,
  });
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) clearCreateActionIntent();
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setDnsDomain("");
      setDnsName("");
      setNetworkId("");
      setAdminStateUp(true);
      setVnicType("normal");
      setHardwareOffloadType(PORT_SETTING_DEFAULT);
      setNumaAffinityPolicy(PORT_SETTING_DEFAULT);
      setTrustedVif(PORT_SETTING_DEFAULT);
      setPropagateUplinkStatus(true);
      setPortSecurityEnabled(true);
      setSecurityGroupIds([]);
      setAllowedAddressPairs([]);
      setExtraDhcpOptions([]);
      setQosPolicySelection(QOS_POLICY_NONE);
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPortAction(
        { projectId, regionId },
        {
          name,
          description,
          dnsName:
            dnsIntegrationAvailable && dnsName.trim() ? dnsName : undefined,
          dnsDomain:
            dnsDomainPortsAvailable && dnsDomain.trim() ? dnsDomain : undefined,
          networkId,
          adminStateUp,
          vnicType:
            portBindingAvailable && vnicType !== "normal"
              ? vnicType
              : undefined,
          hardwareOffloadType:
            hardwareOffloadAvailable &&
            isNeutronPortHardwareOffloadType(hardwareOffloadType)
              ? hardwareOffloadType
              : undefined,
          numaAffinityPolicy:
            numaAffinityAvailable &&
            isNeutronPortNumaAffinityPolicy(numaAffinityPolicy)
              ? numaAffinityPolicy
              : undefined,
          trusted: trustedVifAvailable
            ? trustedVif === PORT_TRUSTED
              ? true
              : trustedVif === PORT_NOT_TRUSTED
                ? false
                : undefined
            : undefined,
          propagateUplinkStatus:
            uplinkStatusPropagationAvailable && !propagateUplinkStatus
              ? false
              : undefined,
          portSecurityEnabled: portSecurityAvailable
            ? portSecurityEnabled
            : undefined,
          securityGroupIds: securityGroupsAvailable
            ? portSecurityAvailable && !portSecurityEnabled
              ? []
              : securityGroupIds
            : undefined,
          allowedAddressPairs:
            allowedAddressPairsAvailable && allowedAddressPairs.length
              ? allowedAddressPairs
              : undefined,
          extraDhcpOptions:
            extraDhcpOptionsAvailable && extraDhcpOptions.length
              ? extraDhcpOptions
              : undefined,
          qosPolicyId: qosAvailable
            ? optionalQosPolicyIdFromSelection(qosPolicySelection)
            : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create port
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <EthernetPort className="size-5" />
                Create port
              </DialogTitle>
              <DialogDescription>
                Reserve a virtual interface and address on a project network.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="port-name">Name</Label>
                <Input
                  id="port-name"
                  autoFocus
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port-network">Network</Label>
                <Select
                  value={networkId}
                  disabled={pending || networks.isLoading}
                  onValueChange={setNetworkId}
                >
                  <SelectTrigger id="port-network">
                    <SelectValue placeholder="Select a network" />
                  </SelectTrigger>
                  <SelectContent>
                    {(networks.data ?? []).map((network) => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.name || network.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="port-description">Description</Label>
                <Textarea
                  id="port-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {dnsIntegrationAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="port-dns-name">DNS name</Label>
                  <Input
                    id="port-dns-name"
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
                  <Label htmlFor="port-dns-domain">DNS domain</Label>
                  <Input
                    id="port-dns-domain"
                    maxLength={255}
                    placeholder="apps.example.org."
                    value={dnsDomain}
                    disabled={pending}
                    onChange={(event) => setDnsDomain(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional per-port domain. Include the trailing dot.
                  </p>
                </div>
              ) : null}
              {qosAvailable ? (
                <div className="sm:col-span-2">
                  <QosPolicySelect
                    description="A direct policy overrides the network policy for this port."
                    disabled={pending}
                    emptyLabel="Use network policy"
                    error={qosPolicies.isError}
                    id="port-qos-policy"
                    loading={qosPolicies.isLoading}
                    onValueChange={setQosPolicySelection}
                    policies={qosPolicies.data ?? []}
                    value={qosPolicySelection}
                  />
                </div>
              ) : null}
              {portBindingAvailable ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="port-vnic-type">vNIC type</Label>
                  <Select
                    value={vnicType}
                    disabled={pending || directVnicRequired}
                    onValueChange={(value) =>
                      setVnicType(value as NeutronPortVnicType)
                    }
                  >
                    <SelectTrigger id="port-vnic-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NEUTRON_PORT_VNIC_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {switchdevOffloadSelected
                      ? "Switchdev hardware offload requires a Direct vNIC. Select no hardware offload to choose another type."
                      : trustedVifSelected
                        ? "Trusted VIF mode requires a Direct SR-IOV vNIC. Disable trusted mode to choose another type."
                        : `${
                            NEUTRON_PORT_VNIC_TYPE_OPTIONS.find(
                              (option) => option.value === vnicType,
                            )?.description
                          }. Availability depends on the network backend and compute hosts.`}
                  </p>
                </div>
              ) : null}
              {numaAffinityAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="port-numa-affinity">NUMA affinity</Label>
                  <Select
                    value={numaAffinityPolicy}
                    disabled={pending}
                    onValueChange={setNumaAffinityPolicy}
                  >
                    <SelectTrigger id="port-numa-affinity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PORT_SETTING_DEFAULT}>
                        Cloud default
                      </SelectItem>
                      {NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS.filter(
                        (option) =>
                          option.value !== "socket" || numaSocketAvailable,
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
                      "Let Nova and the cloud choose the PCI NUMA placement policy."}
                  </p>
                </div>
              ) : null}
              {hardwareOffloadAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="port-hardware-offload">
                    Hardware offload
                  </Label>
                  <Select
                    value={hardwareOffloadType}
                    disabled={pending}
                    onValueChange={(value) => {
                      setHardwareOffloadType(value);
                      if (value === "switchdev") setVnicType("direct");
                    }}
                  >
                    <SelectTrigger id="port-hardware-offload">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PORT_SETTING_DEFAULT}>None</SelectItem>
                      <SelectItem value="switchdev">Switchdev</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Request a switchdev-offloaded data path with a Direct vNIC.
                    This setting cannot be changed after creation.
                  </p>
                </div>
              ) : null}
              {trustedVifAvailable ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="port-trusted-vif">Trusted VIF</Label>
                  <Select
                    value={trustedVif}
                    disabled={pending}
                    onValueChange={(value) => {
                      setTrustedVif(value);
                      if (value === PORT_TRUSTED) setVnicType("direct");
                    }}
                  >
                    <SelectTrigger id="port-trusted-vif">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PORT_SETTING_DEFAULT}>
                        Cloud default
                      </SelectItem>
                      <SelectItem value={PORT_TRUSTED}>Trusted</SelectItem>
                      <SelectItem value={PORT_NOT_TRUSTED}>
                        Not trusted
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Trusted mode uses a Direct SR-IOV vNIC and passes trust
                    state to services such as Nova. Neutron policy commonly
                    restricts this setting to administrators.
                  </p>
                </div>
              ) : null}
              <ToggleField
                id="port-admin-state"
                className={portSecurityAvailable ? undefined : "sm:col-span-2"}
                label="Admin state up"
                description="Allow traffic when the port is attached."
                checked={adminStateUp}
                disabled={pending}
                onCheckedChange={setAdminStateUp}
              />
              {uplinkStatusPropagationAvailable ? (
                <ToggleField
                  id="port-uplink-status-propagation"
                  label="Propagate uplink status"
                  description="Make the virtual interface link state follow its physical uplink, including SR-IOV ports."
                  checked={propagateUplinkStatus}
                  disabled={pending}
                  onCheckedChange={setPropagateUplinkStatus}
                />
              ) : null}
              {portSecurityAvailable ? (
                <ToggleField
                  id="port-security"
                  label="Port security"
                  description="Enable anti-spoofing and security groups."
                  checked={portSecurityEnabled}
                  disabled={pending}
                  onCheckedChange={(checked) => {
                    setPortSecurityEnabled(checked);
                    if (!checked) {
                      setSecurityGroupIds([]);
                      setAllowedAddressPairs([]);
                    }
                  }}
                />
              ) : null}
              {securityGroupsAvailable &&
              (!portSecurityAvailable || portSecurityEnabled) ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Security groups</Label>
                  <div className="grid max-h-36 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                    {(groups.data ?? []).map((group) => (
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
                    {!groups.isLoading && !groups.data?.length ? (
                      <p className="text-sm text-muted-foreground">
                        No security groups available.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {allowedAddressPairsAvailable ? (
                <AllowedAddressPairsFields
                  disabled={pending}
                  idPrefix="create-port"
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
                  idPrefix="create-port"
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
            !hardwareOffloadAvailable ||
            !numaAffinityAvailable ||
            !portBindingAvailable ||
            !trustedVifAvailable ||
            !uplinkStatusPropagationAvailable ? (
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
                {!hardwareOffloadAvailable ? (
                  <p>{hardwareOffloadUnavailableMessage}</p>
                ) : null}
                {!numaAffinityAvailable ? (
                  <p>{numaAffinitySupport.message}</p>
                ) : null}
                {!portBindingAvailable ? (
                  <p>{portBindingSupport.message}</p>
                ) : null}
                {!trustedVifAvailable ? (
                  <p>{trustedVifUnavailableMessage}</p>
                ) : null}
                {!uplinkStatusPropagationAvailable ? (
                  <p>{uplinkStatusPropagationSupport.message}</p>
                ) : null}
              </MutationAlert>
            ) : null}
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
            <FormError error={error} />
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !name.trim() ||
                  !networkId ||
                  quota.issues.length > 0
                }
              >
                {pending ? "Creating" : "Create port"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AllocateFloatingIpAction({
  dnsIntegrationSupport,
  initiallyOpen = false,
  projectId,
  regionId,
  qosSupport,
}: ScopeProps & {
  dnsIntegrationSupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [floatingNetworkId, setFloatingNetworkId] = useState("");
  const [portSelection, setPortSelection] = useState("none");
  const [description, setDescription] = useState("");
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsName, setDnsName] = useState("");
  const [qosPolicySelection, setQosPolicySelection] = useState(QOS_POLICY_NONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dnsIntegrationAvailable =
    dnsIntegrationSupport.status !== "unsupported";
  const qosAvailable = qosSupport.status !== "unsupported";
  const incompleteDnsRecord =
    Boolean(dnsName.trim()) !== Boolean(dnsDomain.trim());
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "floatingip", requested: 1 }],
    serviceId: "network",
  });
  const externalNetworks = useQuery({
    ...externalNetworksQueryOptions(regionId, projectId),
    enabled: open,
  });
  const ports = useQuery({
    ...portsQueryOptions(regionId, projectId),
    enabled: open,
  });
  const servers = useQuery({
    ...serversQueryOptions(regionId, projectId),
    enabled: open,
  });
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled: open && qosAvailable,
  });
  const portOptions = useMemo(
    () =>
      buildFloatingIpPortOptions({
        externalNetworkIds: (externalNetworks.data ?? []).map(
          (network) => network.id,
        ),
        ports: ports.data ?? [],
        servers: servers.data ?? [],
      }),
    [externalNetworks.data, ports.data, servers.data],
  );
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) clearCreateActionIntent();
    setError(null);
    if (next) {
      setFloatingNetworkId("");
      setPortSelection("none");
      setDescription("");
      setDnsDomain("");
      setDnsName("");
      setQosPolicySelection(QOS_POLICY_NONE);
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const association = parseFloatingIpPortSelection(portSelection);
    startTransition(async () => {
      const result = await createFloatingIpAction(
        { projectId, regionId },
        {
          floatingNetworkId,
          portId: association?.portId,
          fixedIpAddress: association?.fixedIpAddress,
          description,
          dnsName:
            dnsIntegrationAvailable && dnsName.trim() ? dnsName : undefined,
          dnsDomain:
            dnsIntegrationAvailable && dnsDomain.trim() ? dnsDomain : undefined,
          qosPolicyId: qosAvailable
            ? optionalQosPolicyIdFromSelection(qosPolicySelection)
            : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Allocate floating IP
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe2 className="size-5" />
                Allocate floating IP
              </DialogTitle>
              <DialogDescription>
                Reserve a public address now and optionally associate it with a
                port.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="floating-network">External network</Label>
                <Select
                  value={floatingNetworkId}
                  disabled={pending || externalNetworks.isLoading}
                  onValueChange={setFloatingNetworkId}
                >
                  <SelectTrigger id="floating-network">
                    <SelectValue placeholder="Select an external network" />
                  </SelectTrigger>
                  <SelectContent>
                    {(externalNetworks.data ?? []).map((network) => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.name || network.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floating-port">Associate with port</Label>
                <Select
                  value={portSelection}
                  disabled={pending || ports.isLoading || servers.isLoading}
                  onValueChange={setPortSelection}
                >
                  <SelectTrigger id="floating-port">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      Allocate without association
                    </SelectItem>
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
                    {!ports.isLoading && portOptions.length === 0 ? (
                      <SelectItem value="unavailable" disabled>
                        No eligible internal ports
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floating-description">Description</Label>
                <Textarea
                  id="floating-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {qosAvailable ? (
                <QosPolicySelect
                  description="A direct policy overrides any policy inherited from the external network."
                  disabled={pending}
                  emptyLabel="Use external network policy"
                  error={qosPolicies.isError}
                  id="floating-qos-policy"
                  loading={qosPolicies.isLoading}
                  onValueChange={setQosPolicySelection}
                  policies={qosPolicies.data ?? []}
                  value={qosPolicySelection}
                />
              ) : null}
              {dnsIntegrationAvailable ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="floating-dns-name">DNS name</Label>
                    <Input
                      id="floating-dns-name"
                      maxLength={255}
                      placeholder="api"
                      value={dnsName}
                      disabled={pending}
                      onChange={(event) => setDnsName(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Relative record name without a trailing dot.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="floating-dns-domain">DNS domain</Label>
                    <Input
                      id="floating-dns-domain"
                      maxLength={255}
                      placeholder="apps.example.org."
                      value={dnsDomain}
                      disabled={pending}
                      onChange={(event) => setDnsDomain(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Fully qualified domain including the trailing dot.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            {incompleteDnsRecord ? (
              <MutationAlert variant="info" title="Complete the DNS record">
                Enter both a DNS name and DNS domain, or leave both empty.
              </MutationAlert>
            ) : null}
            {!dnsIntegrationAvailable ? (
              <MutationAlert variant="info" title="DNS integration unavailable">
                {dnsIntegrationSupport.message}
              </MutationAlert>
            ) : null}
            {!qosAvailable ? (
              <MutationAlert variant="info" title="QoS policies unavailable">
                {qosSupport.message}
              </MutationAlert>
            ) : null}
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
            <FormError error={error} />
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !floatingNetworkId ||
                  incompleteDnsRecord ||
                  quota.issues.length > 0
                }
              >
                {pending ? "Allocating" : "Allocate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateSecurityGroupAction({
  initiallyOpen = false,
  projectId,
  regionId,
  statefulSupport,
}: ScopeProps & { statefulSupport: OpenStackFeatureSupport }) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stateful, setStateful] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const statefulnessAvailable = statefulSupport.status !== "unsupported";
  const defaultRules = useQuery({
    ...defaultSecurityGroupRulesQueryOptions(regionId, projectId),
    enabled: open,
  });
  const defaultRuleCount = (defaultRules.data ?? []).filter(
    ({ used_in_non_default_sg }) => used_in_non_default_sg,
  ).length;
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [
      { metricId: "security_group", requested: 1 },
      ...(defaultRules.data && defaultRuleCount > 0
        ? [
            {
              metricId: "security_group_rule",
              requested: defaultRuleCount,
            },
          ]
        : []),
    ],
    serviceId: "network",
  });
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (!next) clearCreateActionIntent();
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setStateful(true);
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createSecurityGroupAction(
        { projectId, regionId },
        {
          name,
          description,
          ...(statefulnessAvailable ? { stateful } : {}),
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };
  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create security group
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" />
                Create security group
              </DialogTitle>
              <DialogDescription>
                Create a reusable firewall policy. Add rules from its detail
                view.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  autoFocus
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-description">Description</Label>
                <Textarea
                  id="group-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {statefulSupport.status !== "unsupported" ? (
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id="group-stateful"
                    checked={stateful}
                    disabled={pending}
                    onCheckedChange={(checked) => setStateful(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="group-stateful">
                      Stateful connection tracking
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, return traffic for an allowed connection is
                      accepted automatically. Stateless groups require explicit
                      rules in both directions.
                    </p>
                    {statefulSupport.status === "unknown" ? (
                      <p className="text-xs text-muted-foreground">
                        {statefulSupport.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading || defaultRules.isLoading}
              unavailableMessage={quota.unavailableMessage}
              description={
                defaultRuleCount > 0
                  ? `Creating this custom group also creates ${defaultRuleCount} Neutron default ${defaultRuleCount === 1 ? "rule" : "rules"}. Both quotas are projected.`
                  : "Projected usage includes resources already reserved by operations in progress."
              }
            />
            <FormError error={error} />
            {quota.issues.length ? (
              <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !name.trim() || quota.issues.length > 0}
              >
                {pending ? "Creating" : "Create security group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
