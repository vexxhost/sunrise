"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Cable, Pencil, Plug, Trash2, Unplug } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
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
  addRouterInterfaceAction,
  clearRouterGatewayAction,
  deleteRouterAction,
  removeRouterInterfaceAction,
  setRouterGatewayAction,
  updateRouterAction,
} from "@/lib/openstack/neutron-actions";
import type { Network, Port, Router, Subnet } from "@/types/openstack";

interface RouterDetailActionsProps {
  externalNetworks: Network[];
  interfacePorts: Port[];
  projectId: string;
  regionId: string;
  routerResource: Router;
  subnets: Subnet[];
}

export function RouterDetailActions({
  externalNetworks,
  interfacePorts,
  projectId,
  regionId,
  routerResource,
  subnets,
}: RouterDetailActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<
    "connect" | "delete" | "edit" | "gateway" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(routerResource.name);
  const [description, setDescription] = useState(routerResource.description);
  const [adminStateUp, setAdminStateUp] = useState(
    routerResource.admin_state_up,
  );
  const [gatewayNetworkId, setGatewayNetworkId] = useState(
    routerResource.external_gateway_info?.network_id ?? "none",
  );
  const [enableSnat, setEnableSnat] = useState(
    routerResource.external_gateway_info?.enable_snat ?? true,
  );
  const [subnetId, setSubnetId] = useState("");
  const connectedSubnetIds = useMemo(
    () =>
      new Set(
        interfacePorts.flatMap((port) =>
          port.fixed_ips.map((fixedIp) => fixedIp.subnet_id),
        ),
      ),
    [interfacePorts],
  );
  const availableSubnets = subnets.filter(
    (subnet) => !connectedSubnetIds.has(subnet.id),
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
  const openDialog = (next: typeof dialog) => {
    setError(null);
    if (next === "edit") {
      setName(routerResource.name);
      setDescription(routerResource.description);
      setAdminStateUp(routerResource.admin_state_up);
    }
    if (next === "gateway") {
      setGatewayNetworkId(
        routerResource.external_gateway_info?.network_id ?? "none",
      );
      setEnableSnat(routerResource.external_gateway_info?.enable_snat ?? true);
    }
    if (next === "connect") setSubnetId(availableSubnets[0]?.id ?? "");
    setDialog(next);
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateRouterAction(
        { projectId, regionId },
        routerResource.id,
        { name, description, adminStateUp },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const submitGateway = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result =
        gatewayNetworkId === "none"
          ? await clearRouterGatewayAction(
              { projectId, regionId },
              routerResource.id,
            )
          : await setRouterGatewayAction(
              { projectId, regionId },
              routerResource.id,
              { networkId: gatewayNetworkId, enableSnat },
            );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const submitConnect = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addRouterInterfaceAction(
        { projectId, regionId },
        routerResource.id,
        { subnetId },
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
      const result = await deleteRouterAction(
        { projectId, regionId },
        routerResource.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/compute/networks/routers");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9 gap-2"
          disabled={!availableSubnets.length}
          onClick={() => openDialog("connect")}
        >
          <Plug className="size-4" />
          Connect subnet
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={() => openDialog("gateway")}
        >
          <Cable className="size-4" />
          Gateway
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={() => openDialog("edit")}
        >
          <Pencil className="size-4" />
          Edit
        </Button>
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
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit router</DialogTitle>
              <DialogDescription>
                Update the router label and administrative state.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-router-name">Name</Label>
                <Input
                  id="edit-router-name"
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-router-description">Description</Label>
                <Textarea
                  id="edit-router-description"
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
                    Allow the router to forward traffic.
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
        open={dialog === "gateway"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitGateway}>
            <DialogHeader>
              <DialogTitle>External gateway</DialogTitle>
              <DialogDescription>
                Connect this router to a provider network, or remove its current
                gateway.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="router-gateway">External network</Label>
                <Select
                  value={gatewayNetworkId}
                  disabled={pending}
                  onValueChange={setGatewayNetworkId}
                >
                  <SelectTrigger id="router-gateway">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No external gateway</SelectItem>
                    {externalNetworks.map((network) => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.name || network.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {gatewayNetworkId !== "none" ? (
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={enableSnat}
                    disabled={pending}
                    onCheckedChange={(value) => setEnableSnat(value === true)}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Enable SNAT
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Allow instances to reach external networks through the
                      router.
                    </span>
                  </span>
                </label>
              ) : null}
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
              <Button type="submit" disabled={pending}>
                {pending ? "Updating" : "Update gateway"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "connect"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitConnect}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plug className="size-5" />
                Connect subnet
              </DialogTitle>
              <DialogDescription>
                Add a router interface to a project subnet.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="router-subnet">Subnet</Label>
              <Select
                value={subnetId}
                disabled={pending}
                onValueChange={setSubnetId}
              >
                <SelectTrigger id="router-subnet">
                  <SelectValue placeholder="Select a subnet" />
                </SelectTrigger>
                <SelectContent>
                  {availableSubnets.map((subnet) => (
                    <SelectItem key={subnet.id} value={subnet.id}>
                      {subnet.name || subnet.cidr} · {subnet.cidr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={pending || !subnetId}>
                {pending ? "Connecting" : "Connect subnet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Delete router?"
        description="Disconnect all subnet interfaces and clear the external gateway before deleting this router."
        confirmLabel="Delete router"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {routerResource.name || routerResource.id}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}

export function DisconnectRouterInterfaceAction({
  projectId,
  regionId,
  routerId,
  subnet,
}: {
  projectId: string;
  regionId: string;
  routerId: string;
  subnet: Subnet;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = () => {
    startTransition(async () => {
      const result = await removeRouterInterfaceAction(
        { projectId, regionId },
        routerId,
        { subnetId: subnet.id },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
      router.refresh();
    });
  };
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title="Disconnect subnet"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Unplug className="size-4" />
        <span className="sr-only">Disconnect subnet</span>
      </Button>
      <MutationConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Disconnect subnet?"
        description="Traffic between this subnet and the router will stop until an interface is connected again."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirm}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {subnet.name || subnet.cidr}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
