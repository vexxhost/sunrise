"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, Plug, Trash2, Unplug } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { EditActionButton } from "@/components/resources/EditActionButton";
import {
  changedQosPolicyIdFromSelection,
  QosPolicySelect,
  qosPolicySelection,
} from "@/components/Network/QosPolicySelect";
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
  addRouterExternalGatewayAction,
  addRouterInterfaceAction,
  clearRouterGatewayAction,
  deleteRouterAction,
  removeRouterExternalGatewayAction,
  removeRouterInterfaceAction,
  setRouterGatewayAction,
  updateRouterAction,
} from "@/lib/openstack/neutron-actions";
import type {
  Network,
  Port,
  Router,
  RouterExternalGatewayInfo,
  Subnet,
} from "@/types/openstack";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import { qosPoliciesQueryOptions } from "@/hooks/queries/useNetworks";
import { routerExternalGateways } from "@/lib/openstack/neutron-router-gateways";

interface RouterDetailActionsProps {
  externalNetworks: Network[];
  interfacePorts: Port[];
  projectId: string;
  defaultRouteBfdSupport: OpenStackFeatureSupport;
  defaultRouteEcmpSupport: OpenStackFeatureSupport;
  multihomingSupport: OpenStackFeatureSupport;
  qosGatewaySupport: OpenStackFeatureSupport;
  regionId: string;
  routerResource: Router;
  subnets: Subnet[];
}

export function RouterDetailActions({
  externalNetworks,
  interfacePorts,
  projectId,
  defaultRouteBfdSupport,
  defaultRouteEcmpSupport,
  multihomingSupport,
  qosGatewaySupport,
  regionId,
  routerResource,
  subnets,
}: RouterDetailActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<
    "addGateway" | "connect" | "delete" | "edit" | "gateway" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(routerResource.name);
  const [description, setDescription] = useState(routerResource.description);
  const [adminStateUp, setAdminStateUp] = useState(
    routerResource.admin_state_up,
  );
  const [enableDefaultRouteBfd, setEnableDefaultRouteBfd] = useState(
    Boolean(routerResource.enable_default_route_bfd),
  );
  const [enableDefaultRouteEcmp, setEnableDefaultRouteEcmp] = useState(
    Boolean(routerResource.enable_default_route_ecmp),
  );
  const gateways = routerExternalGateways(routerResource);
  const primaryGateway = gateways[0];
  const [gatewayNetworkId, setGatewayNetworkId] = useState(
    primaryGateway?.network_id ?? "none",
  );
  const [enableSnat, setEnableSnat] = useState(
    primaryGateway?.enable_snat ?? true,
  );
  const [qosPolicySelectionValue, setQosPolicySelectionValue] = useState(
    qosPolicySelection(routerResource.external_gateway_info?.qos_policy_id),
  );
  const [additionalGatewayNetworkId, setAdditionalGatewayNetworkId] =
    useState("");
  const [subnetId, setSubnetId] = useState("");
  const qosGatewayAvailable = qosGatewaySupport.status !== "unsupported";
  const defaultRouteBfdAvailable =
    defaultRouteBfdSupport.status !== "unsupported";
  const defaultRouteEcmpAvailable =
    defaultRouteEcmpSupport.status !== "unsupported";
  const multihomingAvailable = multihomingSupport.status !== "unsupported";
  const qosPolicies = useQuery({
    ...qosPoliciesQueryOptions(regionId, projectId),
    enabled: dialog === "gateway" && qosGatewayAvailable,
  });
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
      setEnableDefaultRouteBfd(
        Boolean(routerResource.enable_default_route_bfd),
      );
      setEnableDefaultRouteEcmp(
        Boolean(routerResource.enable_default_route_ecmp),
      );
    }
    if (next === "gateway") {
      setGatewayNetworkId(
        primaryGateway?.network_id ??
          (multihomingAvailable ? (externalNetworks[0]?.id ?? "") : "none"),
      );
      setEnableSnat(primaryGateway?.enable_snat ?? true);
      setQosPolicySelectionValue(
        qosPolicySelection(routerResource.external_gateway_info?.qos_policy_id),
      );
    }
    if (next === "addGateway") {
      setAdditionalGatewayNetworkId(externalNetworks[0]?.id ?? "");
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
        {
          name,
          description,
          adminStateUp,
          enableDefaultRouteBfd:
            defaultRouteBfdAvailable &&
            enableDefaultRouteBfd !==
              Boolean(routerResource.enable_default_route_bfd)
              ? enableDefaultRouteBfd
              : undefined,
          enableDefaultRouteEcmp:
            defaultRouteEcmpAvailable &&
            enableDefaultRouteEcmp !==
              Boolean(routerResource.enable_default_route_ecmp)
              ? enableDefaultRouteEcmp
              : undefined,
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
  const submitGateway = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result =
        !multihomingAvailable && gatewayNetworkId === "none"
          ? await clearRouterGatewayAction(
              { projectId, regionId },
              routerResource.id,
            )
          : await setRouterGatewayAction(
              { projectId, regionId },
              routerResource.id,
              {
                networkId: gatewayNetworkId,
                enableSnat,
                qosPolicyId: qosGatewayAvailable
                  ? changedQosPolicyIdFromSelection(
                      qosPolicySelectionValue,
                      routerResource.external_gateway_info?.qos_policy_id,
                    )
                  : undefined,
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
  const submitAdditionalGateway = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addRouterExternalGatewayAction(
        { projectId, regionId },
        routerResource.id,
        { networkId: additionalGatewayNetworkId },
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
      router.replace("/networking/routers");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!availableSubnets.length}
          onClick={() => openDialog("connect")}
        >
          <Plug className="size-4" />
          Connect subnet
        </Button>
        <Button variant="outline" onClick={() => openDialog("gateway")}>
          <Cable className="size-4" />
          {primaryGateway ? "Primary gateway" : "Gateway"}
        </Button>
        {multihomingAvailable && primaryGateway ? (
          <Button variant="outline" onClick={() => openDialog("addGateway")}>
            <Cable className="size-4" />
            Add gateway
          </Button>
        ) : null}
        <EditActionButton
          label="Edit router"
          onClick={() => openDialog("edit")}
        />
        <Button
          variant="outline"
          onClick={() => openDialog("delete")}
          tone="danger"
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
                Update the router label, administrative state, and supported
                routing behavior.
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
              {defaultRouteEcmpAvailable ? (
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={enableDefaultRouteEcmp}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      setEnableDefaultRouteEcmp(value === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Default-route ECMP
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Use equal-cost paths across multiple external gateways.
                    </span>
                  </span>
                </label>
              ) : null}
              {defaultRouteBfdAvailable ? (
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={enableDefaultRouteBfd}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      setEnableDefaultRouteBfd(value === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Default-route BFD
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Monitor external gateway paths with bidirectional
                      forwarding detection.
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
                {multihomingAvailable
                  ? "Configure the primary external gateway, SNAT, and gateway QoS policy."
                  : "Connect this router to a provider network, or remove its current gateway."}
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
                    {!multihomingAvailable ? (
                      <SelectItem value="none">No external gateway</SelectItem>
                    ) : null}
                    {externalNetworks.map((network) => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.name || network.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {gatewayNetworkId !== "none" ? (
                <>
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
                  {qosGatewayAvailable ? (
                    <QosPolicySelect
                      description="Apply this policy to the router's external gateway IP traffic."
                      disabled={pending}
                      emptyLabel="No QoS policy"
                      error={qosPolicies.isError}
                      id="router-gateway-qos-policy"
                      loading={qosPolicies.isLoading}
                      onValueChange={setQosPolicySelectionValue}
                      policies={qosPolicies.data ?? []}
                      value={qosPolicySelectionValue}
                    />
                  ) : (
                    <MutationAlert
                      variant="info"
                      title="Gateway QoS policies unavailable"
                    >
                      {qosGatewaySupport.message}
                    </MutationAlert>
                  )}
                </>
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
              <Button
                type="submit"
                disabled={
                  pending || (multihomingAvailable && !gatewayNetworkId)
                }
              >
                {pending ? "Updating" : "Update gateway"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "addGateway"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitAdditionalGateway}>
            <DialogHeader>
              <DialogTitle>Add external gateway</DialogTitle>
              <DialogDescription>
                Add another external path. The primary gateway continues to
                control SNAT and gateway QoS.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="router-additional-gateway">
                External network
              </Label>
              <Select
                value={additionalGatewayNetworkId}
                disabled={pending}
                onValueChange={setAdditionalGatewayNetworkId}
              >
                <SelectTrigger id="router-additional-gateway">
                  <SelectValue placeholder="Select an external network" />
                </SelectTrigger>
                <SelectContent>
                  {externalNetworks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name || network.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The same network can be selected more than once when the cloud
                supports multiple gateway addresses on it.
              </p>
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
              <Button
                type="submit"
                disabled={pending || !additionalGatewayNetworkId}
              >
                {pending ? "Adding" : "Add gateway"}
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

export function RemoveRouterExternalGatewayAction({
  gateway,
  networkLabel,
  removable,
  projectId,
  regionId,
  routerId,
}: {
  gateway: RouterExternalGatewayInfo;
  networkLabel: string;
  removable: boolean;
  projectId: string;
  regionId: string;
  routerId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = () => {
    startTransition(async () => {
      const result = await removeRouterExternalGatewayAction(
        { projectId, regionId },
        routerId,
        {
          networkId: gateway.network_id,
          externalFixedIps: gateway.external_fixed_ips.map((fixedIp) => ({
            subnetId: fixedIp.subnet_id,
            ipAddress: fixedIp.ip_address,
          })),
        },
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
        tone="danger"
        disabled={!removable}
        title={
          removable
            ? "Remove external gateway"
            : "Neutron cannot distinguish multiple unaddressed gateways on this network"
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        <span className="sr-only">Remove external gateway</span>
      </Button>
      <MutationConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove external gateway?"
        description="Traffic using this external path will stop. Other router gateways remain connected."
        confirmLabel="Remove gateway"
        pendingLabel="Removing"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirm}
      >
        <div className="space-y-1 rounded-md border px-3 py-2 text-sm">
          <p>{networkLabel}</p>
          {gateway.external_fixed_ips.map((fixedIp) => (
            <p
              key={`${fixedIp.subnet_id}-${fixedIp.ip_address}`}
              className="font-mono text-xs text-muted-foreground"
            >
              {fixedIp.ip_address}
            </p>
          ))}
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
