"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Pencil, Trash2 } from "lucide-react";
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
  deleteFloatingIpAction,
  updateFloatingIpAction,
} from "@/lib/openstack/neutron-actions";
import {
  buildFloatingIpPortOptions,
  floatingIpPortSelectionValue,
  parseFloatingIpPortSelection,
} from "@/lib/openstack/neutron-floating-ip";
import { externalNetworksQueryOptions } from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import type { FloatingIp, Port } from "@/types/openstack";

export function FloatingIpDetailActions({
  floatingIp,
  ports,
  projectId,
  regionId,
}: {
  floatingIp: FloatingIp;
  ports: Port[];
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"associate" | "delete" | "edit" | null>(
    null,
  );
  const [description, setDescription] = useState(floatingIp.description);
  const currentSelection =
    floatingIp.port_id && floatingIp.fixed_ip_address
      ? floatingIpPortSelectionValue(
          floatingIp.port_id,
          floatingIp.fixed_ip_address,
        )
      : "none";
  const [portSelection, setPortSelection] = useState(currentSelection);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const servers = useQuery({
    ...serversQueryOptions(regionId, projectId),
    enabled: dialog === "associate",
  });
  const externalNetworks = useQuery({
    ...externalNetworksQueryOptions(regionId, projectId),
    enabled: dialog === "associate",
  });
  const portOptions = useMemo(
    () =>
      buildFloatingIpPortOptions({
        externalNetworkIds: (externalNetworks.data ?? []).map(
          (network) => network.id,
        ),
        ports,
        servers: servers.data ?? [],
      }),
    [externalNetworks.data, ports, servers.data],
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
  const open = (next: typeof dialog) => {
    setError(null);
    setDescription(floatingIp.description);
    setPortSelection(currentSelection);
    setDialog(next);
  };
  const update = (
    association: { portId: string; fixedIpAddress: string } | null,
    nextDescription: string,
  ) => {
    startTransition(async () => {
      const result = await updateFloatingIpAction(
        { projectId, regionId },
        floatingIp.id,
        {
          description: nextDescription,
          portId: association?.portId ?? null,
          fixedIpAddress: association?.fixedIpAddress ?? null,
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
  const confirmDelete = () => {
    startTransition(async () => {
      const result = await deleteFloatingIpAction(
        { projectId, regionId },
        floatingIp.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/compute/networks/floating-ips");
    });
  };
  return (
    <>
      <div className="flex items-center gap-2">
        <Button className="h-9 gap-2" onClick={() => open("associate")}>
          <Link2 className="size-4" />
          {floatingIp.port_id ? "Change association" : "Associate"}
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={() => open("edit")}
        >
          <Pencil className="size-4" />
          Edit
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2 text-destructive hover:text-destructive"
          onClick={() => open("delete")}
        >
          <Trash2 className="size-4" />
          Release
        </Button>
      </div>
      <Dialog
        open={dialog === "associate"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              update(
                parseFloatingIpPortSelection(portSelection),
                floatingIp.description,
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Floating IP association</DialogTitle>
              <DialogDescription>
                Map this public address to a fixed address on a project port.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="associate-port">Port</Label>
              <Select
                value={portSelection}
                disabled={
                  pending || servers.isLoading || externalNetworks.isLoading
                }
                onValueChange={setPortSelection}
              >
                <SelectTrigger id="associate-port">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not associated</SelectItem>
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
                  {portOptions.length === 0 ? (
                    <SelectItem value="unavailable" disabled>
                      No eligible internal ports
                    </SelectItem>
                  ) : null}
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
              <Button type="submit" disabled={pending}>
                {pending ? "Updating" : "Update association"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              update(
                floatingIp.port_id && floatingIp.fixed_ip_address
                  ? {
                      portId: floatingIp.port_id,
                      fixedIpAddress: floatingIp.fixed_ip_address,
                    }
                  : null,
                description,
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit floating IP</DialogTitle>
              <DialogDescription>
                Add a project-facing description for this address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="floating-ip-description">Description</Label>
              <Textarea
                id="floating-ip-description"
                value={description}
                disabled={pending}
                onChange={(event) => setDescription(event.target.value)}
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
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Release floating IP?"
        description="The address returns to the external network pool and may be allocated to another project."
        confirmLabel="Release address"
        pendingLabel="Releasing"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 font-mono text-sm">
          {floatingIp.floating_ip_address}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
