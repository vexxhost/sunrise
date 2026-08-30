"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Router as RouterIcon, Trash2, Unplug } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { SubnetAddressFields } from "@/components/Network/SubnetAddressFields";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addRouterInterfaceAction,
  deleteSubnetAction,
  removeRouterInterfaceAction,
  updateSubnetAction,
} from "@/lib/openstack/neutron-actions";
import type { AllocationPool, Port, Router, Subnet } from "@/types/openstack";

export function SubnetDetailActions({
  projectId,
  regionId,
  routerInterfaces,
  routers,
  subnet,
}: {
  projectId: string;
  regionId: string;
  routerInterfaces: Port[];
  routers: Router[];
  subnet: Subnet;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<
    "delete" | "detach" | "edit" | "router" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(subnet.name);
  const [gatewayIp, setGatewayIp] = useState(subnet.gateway_ip ?? "");
  const [enableDhcp, setEnableDhcp] = useState(subnet.enable_dhcp);
  const [allocationPools, setAllocationPools] = useState<AllocationPool[]>(
    subnet.allocation_pools,
  );
  const [dnsNameservers, setDnsNameservers] = useState(subnet.dns_nameservers);
  const [routerId, setRouterId] = useState("");
  const [detachRouterId, setDetachRouterId] = useState("");
  const connectedRouterIds = useMemo(
    () =>
      new Set(
        routerInterfaces
          .filter((port) =>
            port.fixed_ips.some((fixedIp) => fixedIp.subnet_id === subnet.id),
          )
          .map((port) => port.device_id)
          .filter(Boolean),
      ),
    [routerInterfaces, subnet.id],
  );
  const connectedRouters = useMemo(
    () => routers.filter((router) => connectedRouterIds.has(router.id)),
    [connectedRouterIds, routers],
  );
  const availableRouters = useMemo(
    () => routers.filter((router) => !connectedRouterIds.has(router.id)),
    [connectedRouterIds, routers],
  );
  const canAttachRouter =
    connectedRouters.length === 0 && availableRouters.length > 0;
  const detachRouter = routers.find((router) => router.id === detachRouterId);

  const open = (next: typeof dialog) => {
    setError(null);
    if (next === "edit") {
      setName(subnet.name);
      setGatewayIp(subnet.gateway_ip ?? "");
      setEnableDhcp(subnet.enable_dhcp);
      setAllocationPools(subnet.allocation_pools);
      setDnsNameservers(subnet.dns_nameservers);
    }
    if (next === "router") {
      setRouterId(canAttachRouter ? (availableRouters[0]?.id ?? "") : "");
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
      const result = await updateSubnetAction(
        { projectId, regionId },
        subnet.id,
        {
          name,
          description: subnet.description,
          gatewayIp: gatewayIp || undefined,
          enableDhcp,
          allocationPools,
          dnsNameservers,
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
  const submitRouter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addRouterInterfaceAction(
        { projectId, regionId },
        routerId,
        { subnetId: subnet.id },
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
      const result = await removeRouterInterfaceAction(
        { projectId, regionId },
        detachRouterId,
        { subnetId: subnet.id },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      setDetachRouterId("");
      await refresh();
    });
  };
  const confirmDelete = () => {
    startTransition(async () => {
      const result = await deleteSubnetAction(
        { projectId, regionId },
        subnet.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };

  return (
    <>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Manage router attachment for ${subnet.name || subnet.cidr}`}
              onClick={() => open("router")}
            >
              <RouterIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Router attachment</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit subnet ${subnet.name || subnet.cidr}`}
              onClick={() => open("edit")}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit subnet</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              aria-label={`Delete subnet ${subnet.name || subnet.cidr}`}
              onClick={() => open("delete")}
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete subnet</TooltipContent>
        </Tooltip>
      </div>

      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit subnet</DialogTitle>
              <DialogDescription>
                Update address assignment controls for {subnet.cidr}. The CIDR
                cannot be changed after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`subnet-name-${subnet.id}`}>Name</Label>
                <Input
                  id={`subnet-name-${subnet.id}`}
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`subnet-gateway-${subnet.id}`}>
                  Gateway IP
                </Label>
                <Input
                  id={`subnet-gateway-${subnet.id}`}
                  placeholder="No gateway"
                  value={gatewayIp}
                  disabled={pending}
                  onChange={(event) => setGatewayIp(event.target.value)}
                />
              </div>
              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={enableDhcp}
                  disabled={pending}
                  onCheckedChange={(value) => setEnableDhcp(value === true)}
                />
                <span>
                  <span className="block text-sm font-medium">Enable DHCP</span>
                  <span className="block text-xs text-muted-foreground">
                    Automatically configure addresses for attached ports.
                  </span>
                </span>
              </label>
              <SubnetAddressFields
                idPrefix={`edit-subnet-${subnet.id}`}
                allocationPools={allocationPools}
                dnsNameservers={dnsNameservers}
                disabled={pending}
                onAllocationPoolsChange={setAllocationPools}
                onDnsNameserversChange={setDnsNameservers}
              />
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
        open={dialog === "router"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitRouter}>
            <DialogHeader>
              <DialogTitle>Router attachment</DialogTitle>
              <DialogDescription>
                Connect {subnet.name || subnet.cidr} to a project router. The
                router interface uses this subnet&apos;s gateway address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <section className="space-y-2">
                <Label>Connected routers</Label>
                {connectedRouters.length ? (
                  <div className="divide-y rounded-md border">
                    {connectedRouters.map((routerResource) => (
                      <div
                        key={routerResource.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {routerResource.name || routerResource.id}
                          </div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            {routerResource.id}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => {
                            setError(null);
                            setDetachRouterId(routerResource.id);
                            setDialog("detach");
                          }}
                        >
                          <Unplug className="size-4" />
                          Disconnect
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    This subnet is not connected to a router.
                  </p>
                )}
              </section>
              {canAttachRouter ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`subnet-router-${subnet.id}`}>
                    Attach to router
                  </Label>
                  <Select
                    value={routerId}
                    disabled={pending}
                    onValueChange={setRouterId}
                  >
                    <SelectTrigger id={`subnet-router-${subnet.id}`}>
                      <SelectValue placeholder="Select a router" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRouters.map((routerResource) => (
                        <SelectItem
                          key={routerResource.id}
                          value={routerResource.id}
                        >
                          {routerResource.name || routerResource.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : connectedRouters.length ? (
                <p className="text-sm text-muted-foreground">
                  Disconnect the current router before attaching this subnet to
                  another one.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No project routers are available.
                </p>
              )}
            </div>
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Close
              </Button>
              {canAttachRouter ? (
                <Button type="submit" disabled={pending || !routerId}>
                  {pending ? "Attaching" : "Attach subnet"}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={dialog === "detach"}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDialog("router");
            setDetachRouterId("");
          }
        }}
        title="Disconnect subnet?"
        description="Traffic using this router interface will be interrupted immediately."
        confirmLabel="Disconnect subnet"
        pendingLabel="Disconnecting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDetach}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          <div className="font-medium">
            {detachRouter?.name || detachRouterId}
          </div>
          <div className="text-xs text-muted-foreground">
            {subnet.name || subnet.cidr}
          </div>
        </div>
      </MutationConfirmationDialog>

      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete subnet?"
        description="The subnet must not be connected to a router or contain ports. This action cannot be undone."
        confirmLabel="Delete subnet"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          <div className="font-medium">{subnet.name || subnet.id}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {subnet.cidr}
          </div>
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
