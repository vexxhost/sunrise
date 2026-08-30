"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
  addRouterRouteAction,
  removeRouterRouteAction,
  replaceRouterRouteAction,
} from "@/lib/openstack/neutron-actions";
import type { HostRoute } from "@/types/openstack";

interface RouteScopeProps {
  projectId: string;
  regionId: string;
  routerId: string;
}

function RouteFields({
  destination,
  disabled,
  idPrefix,
  nexthop,
  onDestinationChange,
  onNexthopChange,
}: {
  destination: string;
  disabled: boolean;
  idPrefix: string;
  nexthop: string;
  onDestinationChange: (value: string) => void;
  onNexthopChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-destination`}>Destination</Label>
        <Input
          id={`${idPrefix}-destination`}
          required
          placeholder="172.20.0.0/16"
          value={destination}
          disabled={disabled}
          onChange={(event) => onDestinationChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Network CIDR reached through this route.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-nexthop`}>Next hop</Label>
        <Input
          id={`${idPrefix}-nexthop`}
          required
          placeholder="10.0.0.2"
          value={nexthop}
          disabled={disabled}
          onChange={(event) => onNexthopChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Reachable address on a connected router subnet.
        </p>
      </div>
    </div>
  );
}

function useRouteRefresh({ projectId, regionId }: RouteScopeProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
}

export function AddRouterRouteAction({
  projectId,
  regionId,
  routerId,
  routes,
}: RouteScopeProps & { routes: HostRoute[] }) {
  const refresh = useRouteRefresh({ projectId, regionId, routerId });
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [nexthop, setNexthop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const duplicate = routes.some(
    (route) =>
      route.destination === destination.trim() &&
      route.nexthop === nexthop.trim(),
  );
  const show = () => {
    setDestination("");
    setNexthop("");
    setError(null);
    setOpen(true);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (duplicate) {
      setError("This exact route already exists on the router.");
      return;
    }
    startTransition(async () => {
      const result = await addRouterRouteAction(
        { projectId, regionId },
        routerId,
        { destination, nexthop },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      await refresh();
    });
  };

  return (
    <>
      <Button size="sm" className="h-8 gap-2" onClick={show}>
        <Plus className="size-4" />
        Add route
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add static route</DialogTitle>
              <DialogDescription>
                Forward a destination network through a reachable next-hop
                address.
              </DialogDescription>
            </DialogHeader>
            <RouteFields
              idPrefix="add-router-route"
              destination={destination}
              disabled={pending}
              nexthop={nexthop}
              onDestinationChange={setDestination}
              onNexthopChange={setNexthop}
            />
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending || duplicate || !destination.trim() || !nexthop.trim()
                }
              >
                {pending ? "Adding" : "Add route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RouterRouteRowActions({
  projectId,
  regionId,
  route,
  routerId,
  routes,
}: RouteScopeProps & { route: HostRoute; routes: HostRoute[] }) {
  const refresh = useRouteRefresh({ projectId, regionId, routerId });
  const [dialog, setDialog] = useState<"delete" | "edit" | null>(null);
  const [destination, setDestination] = useState(route.destination);
  const [nexthop, setNexthop] = useState(route.nexthop);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unchanged =
    destination.trim() === route.destination &&
    nexthop.trim() === route.nexthop;
  const duplicate = routes.some(
    (candidate) =>
      (candidate.destination !== route.destination ||
        candidate.nexthop !== route.nexthop) &&
      candidate.destination === destination.trim() &&
      candidate.nexthop === nexthop.trim(),
  );
  const openEdit = () => {
    setDestination(route.destination);
    setNexthop(route.nexthop);
    setError(null);
    setDialog("edit");
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (duplicate) {
      setError("This exact route already exists on the router.");
      return;
    }
    startTransition(async () => {
      const result = await replaceRouterRouteAction(
        { projectId, regionId },
        routerId,
        route,
        { destination, nexthop },
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
      const result = await removeRouterRouteAction(
        { projectId, regionId },
        routerId,
        route,
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
      <div className="flex items-center justify-end">
        <Button
          size="icon"
          variant="ghost"
          title="Edit route"
          onClick={openEdit}
        >
          <Pencil className="size-4" />
          <span className="sr-only">Edit route</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Remove route"
          onClick={() => {
            setError(null);
            setDialog("delete");
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Remove route</span>
        </Button>
      </div>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit static route</DialogTitle>
              <DialogDescription>
                Sunrise adds the replacement before removing the current route
                so forwarding is not interrupted.
              </DialogDescription>
            </DialogHeader>
            <RouteFields
              idPrefix={`edit-router-route-${route.destination}`}
              destination={destination}
              disabled={pending}
              nexthop={nexthop}
              onDestinationChange={setDestination}
              onNexthopChange={setNexthop}
            />
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
                  pending ||
                  unchanged ||
                  duplicate ||
                  !destination.trim() ||
                  !nexthop.trim()
                }
              >
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Remove static route?"
        description="Traffic to this destination will no longer use the configured next hop."
        confirmLabel="Remove route"
        pendingLabel="Removing"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="grid gap-1 rounded-md border px-3 py-2 text-sm sm:grid-cols-2">
          <span className="font-mono text-xs">{route.destination}</span>
          <span className="font-mono text-xs text-muted-foreground">
            via {route.nexthop}
          </span>
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
