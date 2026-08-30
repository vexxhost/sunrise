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
  externalNetworksQueryOptions,
  networksQueryOptions,
  portsQueryOptions,
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

interface ScopeProps {
  projectId: string;
  regionId: string;
}

function FormError({ error }: { error: string | null }) {
  return error ? <MutationAlert>{error}</MutationAlert> : null;
}

function ToggleField({
  checked,
  disabled,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
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

export function CreateNetworkAction({ projectId, regionId }: ScopeProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setAdminStateUp(true);
      setPortSecurityEnabled(true);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createNetworkAction(
        { projectId, regionId },
        { name, description, adminStateUp, portSecurityEnabled },
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
      <Button className="h-9 gap-2" onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" /> Create network
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleField
                  id="network-admin-state"
                  label="Admin state up"
                  description="Allow the network to forward traffic."
                  checked={adminStateUp}
                  disabled={pending}
                  onCheckedChange={setAdminStateUp}
                />
                <ToggleField
                  id="network-port-security"
                  label="Port security"
                  description="Apply anti-spoofing and security groups."
                  checked={portSecurityEnabled}
                  disabled={pending}
                  onCheckedChange={setPortSecurityEnabled}
                />
              </div>
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating" : "Create network"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateRouterAction({ projectId, regionId }: ScopeProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setAdminStateUp(true);
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createRouterAction(
        { projectId, regionId },
        { name, description, adminStateUp },
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
      <Button className="h-9 gap-2" onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create router
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
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
              <ToggleField
                id="router-admin-state"
                label="Admin state up"
                description="Make the router available after creation."
                checked={adminStateUp}
                disabled={pending}
                onCheckedChange={setAdminStateUp}
              />
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating" : "Create router"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreatePortAction({ projectId, regionId }: ScopeProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [adminStateUp, setAdminStateUp] = useState(true);
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(true);
  const [securityGroupIds, setSecurityGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const networks = useQuery({
    ...networksQueryOptions(regionId, projectId),
    enabled: open,
  });
  const groups = useQuery({
    ...securityGroupsQueryOptions(regionId, projectId),
    enabled: open,
  });
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (next) {
      setName("");
      setDescription("");
      setNetworkId("");
      setAdminStateUp(true);
      setPortSecurityEnabled(true);
      setSecurityGroupIds([]);
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
          networkId,
          adminStateUp,
          portSecurityEnabled,
          securityGroupIds,
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
      <Button className="h-9 gap-2" onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create port
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
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
              <ToggleField
                id="port-admin-state"
                label="Admin state up"
                description="Allow traffic when the port is attached."
                checked={adminStateUp}
                disabled={pending}
                onCheckedChange={setAdminStateUp}
              />
              <ToggleField
                id="port-security"
                label="Port security"
                description="Enable anti-spoofing and security groups."
                checked={portSecurityEnabled}
                disabled={pending}
                onCheckedChange={(checked) => {
                  setPortSecurityEnabled(checked);
                  if (!checked) setSecurityGroupIds([]);
                }}
              />
              {portSecurityEnabled ? (
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
            </div>
            <FormError error={error} />
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
                disabled={pending || !name.trim() || !networkId}
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

export function AllocateFloatingIpAction({ projectId, regionId }: ScopeProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [floatingNetworkId, setFloatingNetworkId] = useState("");
  const [portSelection, setPortSelection] = useState("none");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
    setError(null);
    if (next) {
      setFloatingNetworkId("");
      setPortSelection("none");
      setDescription("");
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
      <Button className="h-9 gap-2" onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Allocate floating IP
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
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
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !floatingNetworkId}>
                {pending ? "Allocating" : "Allocate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateSecurityGroupAction({ projectId, regionId }: ScopeProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setDialogOpen = (next: boolean) => {
    setOpen(next);
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
      <Button className="h-9 gap-2" onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create security group
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
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
            <FormError error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating" : "Create security group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
