"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link2, Network, Unlink } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
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
import {
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { manilaAvailabilityZonesQueryOptions } from "@/hooks/queries/useManila";
import {
  attachShareNetworkSecurityServiceAction,
  createShareNetworkSubnetAction,
  deleteShareNetworkAction,
  deleteShareNetworkSubnetAction,
  detachShareNetworkSecurityServiceAction,
} from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type {
  ManilaSecurityService,
  ManilaShareNetwork,
  ManilaShareNetworkSubnet,
} from "@/types/openstack";

type Complete = () => Promise<void> | void;

export function ShareNetworkSubnetCreateDialog({
  existingSubnets,
  network,
  onComplete,
  onOpenChange,
  scope,
}: {
  existingSubnets: ManilaShareNetworkSubnet[];
  network: ManilaShareNetwork;
  onComplete: Complete;
  onOpenChange: () => void;
  scope: MutationScope;
}) {
  const [networkId, setNetworkId] = useState("");
  const [subnetId, setSubnetId] = useState("");
  const [availabilityZone, setAvailabilityZone] = useState("default");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [networks, subnets, zones] = useQueries({
    queries: [
      projectNetworksQueryOptions(scope.regionId, scope.projectId),
      subnetsQueryOptions(scope.regionId, scope.projectId),
      manilaAvailabilityZonesQueryOptions(scope.regionId, scope.projectId),
    ],
  });
  const availableNetworks = useMemo(
    () =>
      (networks.data ?? []).filter(
        (candidate) => !candidate["router:external"],
      ),
    [networks.data],
  );
  const availableSubnets = useMemo(
    () =>
      (subnets.data ?? []).filter(
        (candidate) => candidate.network_id === networkId,
      ),
    [networkId, subnets.data],
  );
  const usedZones = new Set(
    existingSubnets.map((subnet) => subnet.availability_zone ?? "default"),
  );
  const invalid =
    !networkId || !subnetId || usedZones.has(availabilityZone) || pending;

  const create = () => {
    if (invalid) return;
    startTransition(async () => {
      setError(null);
      const result = await createShareNetworkSubnetAction(scope, network.id, {
        neutronNetworkId: networkId,
        neutronSubnetId: subnetId,
        availabilityZone:
          availabilityZone === "default" ? undefined : availabilityZone,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="size-5" />
            Add network subnet
          </DialogTitle>
          <DialogDescription>
            Add one project-owned Neutron placement for a Manila storage
            availability zone. A share network can have only one default subnet
            and one subnet per named zone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-share-network-neutron-network">
              Neutron network
            </Label>
            <Select
              value={networkId}
              onValueChange={(value) => {
                setNetworkId(value);
                setSubnetId("");
              }}
              disabled={pending || networks.isLoading}
            >
              <SelectTrigger id="add-share-network-neutron-network">
                <SelectValue placeholder="Choose a private network" />
              </SelectTrigger>
              <SelectContent>
                {availableNetworks.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name || candidate.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-share-network-neutron-subnet">
              Neutron subnet
            </Label>
            <Select
              value={subnetId}
              onValueChange={setSubnetId}
              disabled={pending || subnets.isLoading || !networkId}
            >
              <SelectTrigger id="add-share-network-neutron-subnet">
                <SelectValue placeholder="Choose a subnet" />
              </SelectTrigger>
              <SelectContent>
                {availableSubnets.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name || candidate.id} · {candidate.cidr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-share-network-zone">Availability zone</Label>
            <Select
              value={availabilityZone}
              onValueChange={setAvailabilityZone}
              disabled={pending || zones.isLoading}
            >
              <SelectTrigger id="add-share-network-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" disabled={usedZones.has("default")}>
                  All storage zones
                </SelectItem>
                {(zones.data ?? []).map((zone) => (
                  <SelectItem
                    key={zone.id || zone.name}
                    value={zone.name}
                    disabled={usedZones.has(zone.name)}
                  >
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {usedZones.has(availabilityZone) ? (
              <p className="text-xs text-destructive">
                This share network already has a subnet for the selected zone.
              </p>
            ) : null}
          </div>
        </div>
        {error ? <MutationAlert>{error}</MutationAlert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={create} disabled={invalid}>
            {pending ? "Adding" : "Add subnet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareNetworkSubnetDeleteDialog({
  network,
  onComplete,
  onOpenChange,
  scope,
  subnet,
}: {
  network: ManilaShareNetwork;
  onComplete: Complete;
  onOpenChange: () => void;
  scope: MutationScope;
  subnet: ManilaShareNetworkSubnet;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setPending(true);
    setError(null);
    const result = await deleteShareNetworkSubnetAction(
      scope,
      network.id,
      subnet.id,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onComplete();
    onOpenChange();
  };

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => !open && !pending && onOpenChange()}
      onConfirm={remove}
      pending={pending}
      title="Delete network subnet?"
      description="Shares exported through this subnet or non-auto-deletable share servers will block the operation."
      confirmLabel="Delete subnet"
      pendingLabel="Deleting subnet"
      error={error}
      variant="destructive"
    >
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <div className="font-medium">
          {subnet.availability_zone || "All storage zones"}
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {subnet.id}
        </div>
      </div>
    </MutationConfirmationDialog>
  );
}

export function ShareNetworkSecurityServiceAttachDialog({
  attachedServices,
  availableServices,
  network,
  onComplete,
  onOpenChange,
  scope,
}: {
  attachedServices: ManilaSecurityService[];
  availableServices: ManilaSecurityService[];
  network: ManilaShareNetwork;
  onComplete: Complete;
  onOpenChange: () => void;
  scope: MutationScope;
}) {
  const attachedIds = new Set(attachedServices.map(({ id }) => id));
  const choices = availableServices.filter(({ id }) => !attachedIds.has(id));
  const [serviceId, setServiceId] = useState(choices[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const attach = () => {
    if (!serviceId || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await attachShareNetworkSecurityServiceAction(
        scope,
        network.id,
        serviceId,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-5" />
            Attach security service
          </DialogTitle>
          <DialogDescription>
            Connect a project security service to this share network. Under the
            current Manila 2.51 contract, an in-use network may reject this
            operation because the 2.63 compatibility check is unavailable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="attach-security-service">Security service</Label>
          <Select
            value={serviceId}
            onValueChange={setServiceId}
            disabled={pending}
          >
            <SelectTrigger id="attach-security-service">
              <SelectValue placeholder="Choose a security service" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name || service.id} · {service.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {choices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {availableServices.length === 0
                ? "Create a project security service before attaching one."
                : "Every project security service is already attached."}
            </p>
          ) : null}
        </div>
        {error ? <MutationAlert>{error}</MutationAlert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={attach} disabled={pending || !serviceId}>
            {pending ? "Attaching" : "Attach service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareNetworkSecurityServiceDetachDialog({
  network,
  onComplete,
  onOpenChange,
  scope,
  service,
}: {
  network: ManilaShareNetwork;
  onComplete: Complete;
  onOpenChange: () => void;
  scope: MutationScope;
  service: ManilaSecurityService;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detach = async () => {
    setPending(true);
    setError(null);
    const result = await detachShareNetworkSecurityServiceAction(
      scope,
      network.id,
      service.id,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onComplete();
    onOpenChange();
  };

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => !open && !pending && onOpenChange()}
      onConfirm={detach}
      pending={pending}
      title="Detach security service?"
      description="Share servers using this authentication service can block the operation or lose directory access."
      confirmLabel="Detach service"
      pendingLabel="Detaching service"
      error={error}
      variant="destructive"
    >
      <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <Unlink className="size-4 text-muted-foreground" />
        <span>{service.name || service.id}</span>
      </div>
    </MutationConfirmationDialog>
  );
}

export function ShareNetworkDeleteDialog({
  network,
  onComplete,
  onOpenChange,
  scope,
}: {
  network: ManilaShareNetwork;
  onComplete: Complete;
  onOpenChange: () => void;
  scope: MutationScope;
}) {
  const confirmationName = network.name || network.id;
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (confirmation !== confirmationName) return;
    setPending(true);
    setError(null);
    const result = await deleteShareNetworkAction(scope, network.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onComplete();
    onOpenChange();
  };

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => !open && !pending && onOpenChange()}
      onConfirm={remove}
      pending={pending}
      title="Delete share network?"
      description="Manila will reject deletion while shares, share servers, or other dependencies still use this network."
      confirmLabel="Delete share network"
      pendingLabel="Deleting share network"
      confirmDisabled={confirmation !== confirmationName}
      error={error}
      variant="destructive"
    >
      <div className="space-y-2">
        <Label htmlFor="delete-share-network-confirmation">
          Type <span className="font-mono">{confirmationName}</span> to confirm
        </Label>
        <Input
          id="delete-share-network-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          disabled={pending}
        />
      </div>
    </MutationConfirmationDialog>
  );
}
