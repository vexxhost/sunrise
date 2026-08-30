"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, Pencil, Trash2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
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

type PortDialog = "attach" | "delete" | "detach" | "edit" | null;

interface PortDetailActionsProps {
  groups: SecurityGroup[];
  port: Port;
  projectId: string;
  regionId: string;
  servers: Server[];
}

export function PortDetailActions({
  groups,
  port,
  projectId,
  regionId,
  servers,
}: PortDetailActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<PortDialog>(null);
  const [name, setName] = useState(port.name);
  const [description, setDescription] = useState(port.description);
  const [adminStateUp, setAdminStateUp] = useState(port.admin_state_up);
  const [portSecurityEnabled, setPortSecurityEnabled] = useState(
    port.port_security_enabled,
  );
  const [securityGroupIds, setSecurityGroupIds] = useState(
    port.security_groups,
  );
  const [serverId, setServerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const computeAttached =
    port.device_owner.startsWith("compute:") && Boolean(port.device_id);
  const infrastructureManaged = Boolean(port.device_owner) && !computeAttached;

  if (infrastructureManaged) {
    return <Badge variant="outline">Managed by OpenStack</Badge>;
  }

  const open = (next: Exclude<PortDialog, null>) => {
    setError(null);
    if (next === "edit") {
      setName(port.name);
      setDescription(port.description);
      setAdminStateUp(port.admin_state_up);
      setPortSecurityEnabled(port.port_security_enabled);
      setSecurityGroupIds(port.security_groups);
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
      const result = await updatePortAction({ projectId, regionId }, port.id, {
        name,
        description,
        adminStateUp,
        portSecurityEnabled,
        securityGroupIds,
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
      router.replace("/compute/networks/ports");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {computeAttached ? (
          <Button
            className="h-9 gap-2"
            variant="outline"
            onClick={() => open("detach")}
          >
            <Link2Off className="size-4" /> Detach
          </Button>
        ) : (
          <Button className="h-9 gap-2" onClick={() => open("attach")}>
            <Link2 className="size-4" /> Attach to instance
          </Button>
        )}
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={() => open("edit")}
        >
          <Pencil className="size-4" /> Edit
        </Button>
        {!computeAttached ? (
          <Button
            variant="outline"
            className="h-9 gap-2 text-destructive hover:text-destructive"
            onClick={() => open("delete")}
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
        <DialogContent className="max-w-2xl">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit port</DialogTitle>
              <DialogDescription>
                Update the interface label, state, and security policy.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-port-name">Name</Label>
                <Input
                  id="edit-port-name"
                  required
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
                    Allow traffic when attached.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={portSecurityEnabled}
                  disabled={pending}
                  onCheckedChange={(value) => {
                    const checked = value === true;
                    setPortSecurityEnabled(checked);
                    if (!checked) setSecurityGroupIds([]);
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
              {portSecurityEnabled ? (
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
