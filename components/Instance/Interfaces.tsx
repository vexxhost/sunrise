"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DataTable, type DataTableRowAction } from "@/components/DataTable";
import { IDCell } from "@/components/DataTable/IDCell";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  Network as NetworkResource,
  Port,
  SecurityGroup,
} from "@/types/openstack";
import type { ColumnDef } from "@tanstack/react-table";
import { Link2, Link2Off, Network, ShieldCheck } from "lucide-react";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  attachPortAction,
  detachPortAction,
} from "@/lib/openstack/nova-actions";
import { updatePortAction } from "@/lib/openstack/neutron-actions";
import { normalizeMutationProjectId } from "@/lib/mutations";

export const columns: ColumnDef<Port>[] = [
  {
    accessorKey: "id",
    header: "Port ID",
    enableHiding: false,
    cell: ({ row }) => (
      <IDCell
        value={row.original.id}
        isSelected={row.getIsSelected()}
        linkPath="/networking/ports"
      />
    ),
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true,
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) =>
      row.original.name ? (
        <ResourceLink
          href={`/networking/ports/${encodeURIComponent(row.original.id)}`}
        >
          {row.original.name}
        </ResourceLink>
      ) : (
        <span className="text-muted-foreground">Not named</span>
      ),
    meta: {
      fieldType: "string",
      visible: false,
    },
  },
  {
    accessorKey: "network_name",
    header: "Network",
    cell: ({ row }) => (
      <ResourceLink
        href={`/networking/networks/${encodeURIComponent(row.original.network_id)}`}
        className={row.original.network_name ? undefined : "font-mono text-xs"}
      >
        {row.original.network_name || row.original.network_id}
      </ResourceLink>
    ),
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "fixed_ips",
    header: "Fixed IP addresses",
    cell: ({ row }) =>
      row.original.fixed_ips.length > 0
        ? row.original.fixed_ips.map(({ ip_address }) => ip_address).join(", ")
        : "-",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "mac_address",
    header: "MAC address",
    meta: {
      fieldType: "string",
      visible: true,
      monospace: true,
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "admin_state_up",
    header: "Admin state",
    cell: ({ row }) => (row.original.admin_state_up ? "Up" : "Down"),
    meta: {
      fieldType: "boolean",
      visible: false,
    },
  },
];

interface InterfacesProps {
  allPorts: Port[];
  canModify: boolean;
  networkPorts: Port[];
  networks: NetworkResource[];
  projectId?: string;
  regionId?: string;
  securityGroups: SecurityGroup[];
  serverId: string;
}

type InterfaceDialog = "attach" | "detach" | "security-groups" | null;

export function Interfaces({
  allPorts,
  canModify,
  networkPorts,
  networks,
  projectId,
  regionId,
  securityGroups,
  serverId,
}: InterfacesProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<InterfaceDialog>(null);
  const [targets, setTargets] = useState<Port[]>([]);
  const [portId, setPortId] = useState("");
  const [securityGroupIds, setSecurityGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const networkNames = useMemo(
    () => new Map(networks.map((network) => [network.id, network.name])),
    [networks],
  );
  const attachablePorts = useMemo(
    () =>
      allPorts
        .filter((port) => !port.device_id && !port.device_owner)
        .sort((left, right) =>
          (left.name || left.id).localeCompare(right.name || right.id),
        ),
    [allPorts],
  );
  const groups = useMemo(
    () =>
      securityGroups
        .filter(
          (group) =>
            normalizeMutationProjectId(group.project_id) ===
            normalizeMutationProjectId(projectId),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [projectId, securityGroups],
  );
  const securityGroupSelectionChanged = useMemo(() => {
    const original = [...(targets[0]?.security_groups ?? [])].sort();
    const selected = [...securityGroupIds].sort();
    return (
      original.length !== selected.length ||
      original.some((groupId, index) => groupId !== selected[index])
    );
  }, [securityGroupIds, targets]);

  const close = () => {
    if (pending) return;
    setDialog(null);
    setTargets([]);
    setPortId("");
    setSecurityGroupIds([]);
    setError(null);
  };

  const refresh = async (changedPortIds: string[]) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "server", serverId],
      }),
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "server-interfaces", serverId],
      }),
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "ports"],
      }),
      ...changedPortIds.map((id) =>
        queryClient.invalidateQueries({
          queryKey: [regionId, projectId, "port", id],
        }),
      ),
    ]);
  };

  const openSecurityGroups = (ports: Port[]) => {
    const port = ports[0];
    if (!port) return;
    setTargets([port]);
    setSecurityGroupIds(port.security_groups);
    setError(null);
    setDialog("security-groups");
  };

  const rowActions: DataTableRowAction<Port>[] = [
    {
      label: "Manage port security groups",
      icon: ShieldCheck,
      onClick: openSecurityGroups,
      isDisabled: (rows) =>
        !canModify || rows.length !== 1 || !rows[0]?.port_security_enabled,
    },
    {
      label: "Detach interfaces",
      icon: Link2Off,
      variant: "destructive",
      onClick: (rows) => {
        setTargets(rows);
        setError(null);
        setDialog("detach");
      },
      isDisabled: (rows) => !canModify || rows.length === 0,
    },
  ];

  const submitAttach = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !portId) return;
    startTransition(async () => {
      setError(null);
      const result = await attachPortAction(
        { projectId, regionId },
        { portId, serverId },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await refresh([portId]);
      close();
    });
  };

  const submitSecurityGroups = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const port = targets[0];
    if (!projectId || !regionId || !port) return;
    startTransition(async () => {
      setError(null);
      const result = await updatePortAction({ projectId, regionId }, port.id, {
        name: port.name,
        description: port.description,
        adminStateUp: port.admin_state_up,
        portSecurityEnabled: port.port_security_enabled,
        securityGroupIds,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await refresh([port.id]);
      close();
    });
  };

  const confirmDetach = () => {
    if (!projectId || !regionId || !targets.length) return;
    startTransition(async () => {
      setError(null);
      for (const port of targets) {
        const result = await detachPortAction(
          { projectId, regionId },
          { portId: port.id, serverId },
        );
        if (!result.ok) {
          setError(
            `${port.name || port.id}: ${result.error.message} Refresh before retrying; earlier interfaces may already be detached.`,
          );
          await refresh(targets.map(({ id }) => id));
          return;
        }
      }
      await refresh(targets.map(({ id }) => id));
      close();
    });
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Instance interfaces</h2>
          <p className="text-xs text-muted-foreground">
            Attach existing project ports or manage policy on one exact port.
          </p>
        </div>
        <Button
          type="button"
          className="h-10 gap-2 self-start"
          disabled={!canModify}
          onClick={() => {
            setError(null);
            setPortId("");
            setDialog("attach");
          }}
        >
          <Link2 className="size-4" />
          Attach interface
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={networkPorts}
        emptyIcon={Network}
        resourceName="instance interface"
        rowActions={rowActions}
        getRowId={(port) => port.id}
        refetch={() => void refresh(networkPorts.map(({ id }) => id))}
      />

      <Dialog
        open={dialog === "attach"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitAttach}>
            <DialogHeader>
              <DialogTitle>Attach interface</DialogTitle>
              <DialogDescription>
                Connect an existing unbound Neutron port to this instance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="instance-port">Port</Label>
              <Select
                value={portId}
                onValueChange={setPortId}
                disabled={pending}
              >
                <SelectTrigger id="instance-port">
                  <SelectValue placeholder="Choose an available port" />
                </SelectTrigger>
                <SelectContent>
                  {attachablePorts.map((port) => (
                    <SelectItem key={port.id} value={port.id}>
                      {port.name || port.id} ·{" "}
                      {networkNames.get(port.network_id) || port.network_id} ·{" "}
                      {port.fixed_ips
                        .map(({ ip_address }) => ip_address)
                        .join(", ") || "IP pending"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {attachablePorts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No unbound project ports are available.{" "}
                  <ResourceLink href="/networking/ports">
                    Create a port in Networking
                  </ResourceLink>
                  , then return to attach it.
                </p>
              ) : null}
            </div>
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !portId}>
                {pending ? <Spinner /> : null}
                {pending ? "Attaching" : "Attach interface"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "security-groups"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-x-hidden overflow-y-auto">
          <form className="min-w-0 space-y-5" onSubmit={submitSecurityGroups}>
            <DialogHeader>
              <DialogTitle>Manage port security groups</DialogTitle>
              <DialogDescription className="break-words [overflow-wrap:anywhere]">
                Replace the security groups enforced on{" "}
                {targets[0]?.name || targets[0]?.id} only.
              </DialogDescription>
            </DialogHeader>
            <MutationAlert variant="info" title="Port-specific policy">
              This does not change the instance&apos;s other interfaces. Neutron
              replaces the complete security-group set on this port.
            </MutationAlert>
            <div className="grid max-h-64 min-w-0 gap-2 overflow-y-auto rounded-md border p-3">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className="flex min-w-0 items-start gap-2 text-sm"
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
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {group.name || group.id}
                  </span>
                </label>
              ))}
            </div>
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !securityGroupSelectionChanged}
              >
                {pending ? <Spinner /> : null}
                {pending ? "Saving" : "Save port policy"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={dialog === "detach"}
        onOpenChange={(open) => !open && close()}
        title="Detach interfaces?"
        description="The instance will lose these interfaces and their fixed addresses until the ports are attached again."
        confirmLabel="Detach interfaces"
        pendingLabel="Detaching"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDetach}
      >
        <div className="max-h-36 overflow-y-auto rounded-md border px-3 py-2 text-sm">
          {targets.map((port) => (
            <div key={port.id} className="truncate py-1">
              {port.name || port.id}
            </div>
          ))}
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
