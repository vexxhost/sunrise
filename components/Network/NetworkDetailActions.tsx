"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { IPv6ConfigurationField } from "@/components/Network/IPv6ConfigurationField";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { SubnetAddressFields } from "@/components/Network/SubnetAddressFields";
import { EditActionButton } from "@/components/resources/EditActionButton";
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
  createSubnetAction,
  deleteNetworkAction,
  updateNetworkAction,
} from "@/lib/openstack/neutron-actions";
import { getCidrValidationError } from "@/lib/network-address";
import { usesIpv6AutoAddressing } from "@/lib/openstack/neutron-ipv6";
import type {
  AllocationPool,
  HostRoute,
  IPv6ConfigurationMode,
  Network,
} from "@/types/openstack";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";

interface NetworkDetailActionsProps {
  network: Network;
  projectId: string;
  regionId: string;
}

export function NetworkDetailActions({
  network,
  projectId,
  regionId,
}: NetworkDetailActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"delete" | "edit" | "subnet" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(network.name);
  const [description, setDescription] = useState(network.description);
  const [adminStateUp, setAdminStateUp] = useState(network.admin_state_up);
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(
    network.port_security_enabled,
  );
  const [subnetName, setSubnetName] = useState("");
  const [cidr, setCidr] = useState("");
  const [ipVersion, setIpVersion] = useState<4 | 6>(4);
  const [gatewayIp, setGatewayIp] = useState("");
  const [disableGateway, setDisableGateway] = useState(false);
  const [enableDhcp, setEnableDhcp] = useState(true);
  const [ipv6Mode, setIpv6Mode] = useState<IPv6ConfigurationMode>("none");
  const [allocationPools, setAllocationPools] = useState<AllocationPool[]>([]);
  const [dnsNameservers, setDnsNameservers] = useState<string[]>([]);
  const [hostRoutes, setHostRoutes] = useState<HostRoute[]>([]);
  const subnetQuota = useProjectQuotaImpact({
    enabled: dialog === "subnet",
    projectId,
    regionId,
    requests: [{ metricId: "subnet", requested: 1 }],
    serviceId: "network",
  });

  const openDialog = (next: typeof dialog) => {
    setError(null);
    if (next === "edit") {
      setName(network.name);
      setDescription(network.description);
      setAdminStateUp(network.admin_state_up);
      setPortSecurityEnabled(network.port_security_enabled);
    }
    if (next === "subnet") {
      setSubnetName("");
      setCidr("");
      setIpVersion(4);
      setGatewayIp("");
      setDisableGateway(false);
      setEnableDhcp(true);
      setIpv6Mode("none");
      setAllocationPools([]);
      setDnsNameservers([]);
      setHostRoutes([]);
    }
    setDialog(next);
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateNetworkAction(
        { projectId, regionId },
        network.id,
        { name, description, adminStateUp, portSecurityEnabled },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const submitSubnet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createSubnetAction(
        { projectId, regionId },
        {
          networkId: network.id,
          name: subnetName,
          description: "",
          cidr,
          ipVersion,
          gatewayIp: gatewayIp || undefined,
          disableGateway,
          enableDhcp,
          ipv6Mode,
          allocationPools: allocationPools.length ? allocationPools : undefined,
          dnsNameservers: dnsNameservers.length ? dnsNameservers : undefined,
          hostRoutes: hostRoutes.length ? hostRoutes : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const cidrError = getCidrValidationError(cidr, ipVersion, {
    require64: ipVersion === 6 && usesIpv6AutoAddressing(ipv6Mode),
  });
  const confirmDelete = () => {
    startTransition(async () => {
      const result = await deleteNetworkAction(
        { projectId, regionId },
        network.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/networking/networks");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9 gap-2" onClick={() => openDialog("subnet")}>
          <Plus className="size-4" />
          Add subnet
        </Button>
        <EditActionButton
          label="Edit network"
          onClick={() => openDialog("edit")}
        />
        <Button
          variant="outline"
          className="h-9 gap-2 text-destructive hover:text-destructive"
          onClick={() => openDialog("delete")}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <Dialog
        open={dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit network</DialogTitle>
              <DialogDescription>
                Update the network label and administrative controls.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-network-name">Name</Label>
                <Input
                  id="edit-network-name"
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-network-description">Description</Label>
                <Textarea
                  id="edit-network-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <label className="flex items-start gap-3 rounded-md border p-3">
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
                    Allow the network to forward traffic.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={portSecurityEnabled}
                  disabled={pending}
                  onCheckedChange={(value) =>
                    setPortSecurityEnabled(value === true)
                  }
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
            </div>
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
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "subnet"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submitSubnet}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="size-5" />
                Add subnet
              </DialogTitle>
              <DialogDescription>
                Define an IPv4 or IPv6 address space on{" "}
                {network.name || network.id}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="subnet-name">Name</Label>
                <Input
                  id="subnet-name"
                  autoFocus
                  required
                  value={subnetName}
                  disabled={pending}
                  onChange={(event) => setSubnetName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subnet-ip-version">IP version</Label>
                <Select
                  value={String(ipVersion)}
                  disabled={pending}
                  onValueChange={(value) => {
                    const nextVersion = value === "6" ? 6 : 4;
                    setIpVersion(nextVersion);
                    if (nextVersion === 4) setIpv6Mode("none");
                  }}
                >
                  <SelectTrigger id="subnet-ip-version">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">IPv4</SelectItem>
                    <SelectItem value="6">IPv6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subnet-cidr">CIDR</Label>
                <Input
                  id="subnet-cidr"
                  required
                  placeholder={
                    ipVersion === 6 ? "2001:db8::/64" : "10.0.0.0/24"
                  }
                  value={cidr}
                  disabled={pending}
                  aria-invalid={Boolean(cidrError)}
                  aria-describedby={cidrError ? "subnet-cidr-error" : undefined}
                  onChange={(event) => setCidr(event.target.value)}
                />
                {cidrError ? (
                  <p
                    id="subnet-cidr-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {cidrError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="subnet-gateway">Gateway IP</Label>
                <Input
                  id="subnet-gateway"
                  placeholder="Selected automatically"
                  value={gatewayIp}
                  disabled={pending || disableGateway}
                  onChange={(event) => setGatewayIp(event.target.value)}
                />
              </div>
              <label className="flex items-start gap-3 rounded-md border p-3 sm:col-span-2">
                <Checkbox
                  checked={disableGateway}
                  disabled={pending}
                  onCheckedChange={(value) => setDisableGateway(value === true)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Disable gateway
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Create this subnet without a default gateway.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 sm:col-span-2">
                <Checkbox
                  checked={enableDhcp}
                  disabled={pending}
                  onCheckedChange={(value) => {
                    const enabled = value === true;
                    setEnableDhcp(enabled);
                    if (!enabled) setIpv6Mode("none");
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">Enable DHCP</span>
                  <span className="block text-xs text-muted-foreground">
                    Automatically configure addresses for attached ports.
                  </span>
                </span>
              </label>
              {ipVersion === 6 ? (
                <div className="sm:col-span-2">
                  <IPv6ConfigurationField
                    id="subnet-ipv6-configuration"
                    mode={ipv6Mode}
                    disabled={pending}
                    onModeChange={(mode) => {
                      setIpv6Mode(mode);
                      if (mode !== "none") setEnableDhcp(true);
                    }}
                  />
                </div>
              ) : null}
              <SubnetAddressFields
                idPrefix="create-subnet"
                allocationPools={allocationPools}
                dnsNameservers={dnsNameservers}
                hostRoutes={hostRoutes}
                disabled={pending}
                ipVersion={ipVersion}
                onAllocationPoolsChange={setAllocationPools}
                onDnsNameserversChange={setDnsNameservers}
                onHostRoutesChange={setHostRoutes}
              />
            </div>
            <QuotaImpactPreview
              impacts={subnetQuota.impacts}
              loading={subnetQuota.loading}
              unavailableMessage={subnetQuota.unavailableMessage}
            />
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            {subnetQuota.issues.length ? (
              <MutationAlert>{subnetQuota.issues.join(" ")}</MutationAlert>
            ) : null}
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
                disabled={
                  pending ||
                  !subnetName.trim() ||
                  !cidr.trim() ||
                  Boolean(cidrError) ||
                  subnetQuota.issues.length > 0
                }
              >
                {pending ? "Creating" : "Add subnet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Delete network?"
        description="The network must have no ports or subnets. This action cannot be undone."
        confirmLabel="Delete network"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {network.name || network.id}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
