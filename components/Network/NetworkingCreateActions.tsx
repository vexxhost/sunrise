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
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import {
  QOS_POLICY_CLOUD_DEFAULT,
  QOS_POLICY_NONE,
  QosPolicySelect,
  qosPolicyIdFromSelection,
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
import { cn } from "@/lib/utils";

interface ScopeProps {
  initiallyOpen?: boolean;
  projectId: string;
  regionId: string;
}

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
  projectId,
  regionId,
  portSecuritySupport,
  qosSupport,
}: ScopeProps & {
  availabilityZoneSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dnsDomain, setDnsDomain] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [selectedAvailabilityZones, setSelectedAvailabilityZones] =
    useState("");
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
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
      setAdminStateUp(true);
      setSelectedAvailabilityZones("");
      setPortSecurityEnabled(true);
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
          qosPolicyId:
            qosAvailable && qosPolicySelection !== QOS_POLICY_CLOUD_DEFAULT
              ? qosPolicyIdFromSelection(qosPolicySelection)
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
              {qosAvailable ? (
                <QosPolicySelect
                  description="Use the project's cloud default, explicitly create the network without QoS, or attach a visible policy."
                  disabled={pending}
                  emptyLabel="Cloud default"
                  emptyValue={QOS_POLICY_CLOUD_DEFAULT}
                  error={qosPolicies.isError}
                  id="network-qos-policy"
                  loading={qosPolicies.isLoading}
                  onValueChange={setQosPolicySelection}
                  policies={qosPolicies.data ?? []}
                  showNoPolicyOption
                  value={qosPolicySelection}
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleField
                  id="network-admin-state"
                  className={
                    portSecurityAvailable ? undefined : "sm:col-span-2"
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
  initiallyOpen = false,
  projectId,
  regionId,
}: ScopeProps & { availabilityZoneSupport: OpenStackFeatureSupport }) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [selectedAvailabilityZones, setSelectedAvailabilityZones] =
    useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const availabilityZonesAvailable =
    availabilityZoneSupport.status !== "unsupported";
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
  initiallyOpen = false,
  projectId,
  regionId,
  portSecuritySupport,
  qosSupport,
  securityGroupSupport,
}: ScopeProps & {
  allowedAddressPairsSupport: OpenStackFeatureSupport;
  dnsDomainPortsSupport: OpenStackFeatureSupport;
  dnsIntegrationSupport: OpenStackFeatureSupport;
  portSecuritySupport: OpenStackFeatureSupport;
  qosSupport: OpenStackFeatureSupport;
  securityGroupSupport: OpenStackFeatureSupport;
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
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
  const [securityGroupIds, setSecurityGroupIds] = useState<string[]>([]);
  const [allowedAddressPairs, setAllowedAddressPairs] = useState<
    AllowedAddressPairInput[]
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
  const qosAvailable = qosSupport.status !== "unsupported";
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
      setPortSecurityEnabled(true);
      setSecurityGroupIds([]);
      setAllowedAddressPairs([]);
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
          qosPolicyId: qosAvailable
            ? qosPolicyIdFromSelection(qosPolicySelection)
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
              <ToggleField
                id="port-admin-state"
                className={portSecurityAvailable ? undefined : "sm:col-span-2"}
                label="Admin state up"
                description="Allow traffic when the port is attached."
                checked={adminStateUp}
                disabled={pending}
                onCheckedChange={setAdminStateUp}
              />
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
            </div>
            {!portSecurityAvailable ||
            !securityGroupsAvailable ||
            !allowedAddressPairsAvailable ||
            !dnsIntegrationAvailable ||
            !dnsDomainPortsAvailable ||
            !qosAvailable ? (
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
                {!dnsIntegrationAvailable ? (
                  <p>{dnsIntegrationSupport.message}</p>
                ) : null}
                {dnsIntegrationAvailable && !dnsDomainPortsAvailable ? (
                  <p>{dnsDomainPortsSupport.message}</p>
                ) : null}
                {!qosAvailable ? <p>{qosSupport.message}</p> : null}
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
            ? qosPolicyIdFromSelection(qosPolicySelection)
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
}: ScopeProps) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createSecurityGroupAction(
        { projectId, regionId },
        { name, description },
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
                Create a reusable stateful firewall policy. Add rules from its
                detail view.
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
