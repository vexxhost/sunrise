"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
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
import { Spinner } from "@/components/ui/spinner";
import { flavorsQueryOptions } from "@/hooks/queries/useServers";
import {
  projectQuotaQueryOptions,
  quotaQueryUnavailableMessage,
} from "@/hooks/queries/useQuotas";
import {
  formatFlavorRam,
  resizeFlavorDiskUnavailableReason,
} from "@/lib/openstack/flavor";
import { resizeServerAction } from "@/lib/openstack/nova-actions";
import {
  novaResizeQuotaImpacts,
  quotaImpactIssues,
  quotaUnavailableReason,
} from "@/lib/openstack/quota-impact";
import { resolveServerFlavor } from "@/lib/openstack/server-flavor";
import {
  markServersTaskStateIfStatus,
  markServerTaskStateIfStatus,
} from "@/lib/openstack/server-lifecycle";
import type { Server } from "@/types/openstack";

interface InstanceResizeDialogProps {
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId?: string;
  regionId?: string;
  server: Server;
}

export function InstanceResizeDialog({
  onComplete,
  onOpenChange,
  open,
  projectId,
  regionId,
  server,
}: InstanceResizeDialogProps) {
  const queryClient = useQueryClient();
  const [flavorRef, setFlavorRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const flavors = useQuery({
    ...flavorsQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const quota = useQuery({
    ...projectQuotaQueryOptions(regionId, projectId, "compute"),
    enabled: open && Boolean(regionId && projectId),
  });
  const currentFlavor = useMemo(
    () => resolveServerFlavor(server, flavors.data ?? []),
    [flavors.data, server],
  );
  const choices = useMemo(
    () =>
      (flavors.data ?? []).filter(
        (flavor) =>
          !flavor["OS-FLV-DISABLED:disabled"] &&
          String(flavor.id) !== currentFlavor.id,
      ),
    [currentFlavor.id, flavors.data],
  );
  const selectedFlavor = choices.find(
    (flavor) => String(flavor.id) === flavorRef,
  );
  const quotaMetrics = useMemo(
    () => (quota.data?.status === "available" ? quota.data.metrics : []),
    [quota.data],
  );
  const quotaImpacts = useMemo(
    () => novaResizeQuotaImpacts(quotaMetrics, server.flavor, selectedFlavor),
    [quotaMetrics, selectedFlavor, server.flavor],
  );
  const quotaIssues = useMemo(
    () => quotaImpactIssues(quotaImpacts),
    [quotaImpacts],
  );
  const flavorUnavailableReasons = useMemo(
    () =>
      new Map(
        choices.map((flavor) => {
          const diskReason = resizeFlavorDiskUnavailableReason(
            server.flavor,
            flavor,
          );
          const quotaReason = quotaUnavailableReason(
            novaResizeQuotaImpacts(quotaMetrics, server.flavor, flavor),
          );
          return [
            String(flavor.id),
            diskReason ??
              (quotaReason ? `Insufficient ${quotaReason} quota` : null),
          ];
        }),
      ),
    [choices, quotaMetrics, server.flavor],
  );
  const quotaUnavailableMessage = quotaQueryUnavailableMessage(
    quota,
    "Compute quotas are unavailable. Nova will validate the resize when it is submitted.",
  );

  const close = () => {
    if (pending) return;
    setFlavorRef("");
    setError(null);
    onOpenChange(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !flavorRef) return;

    startTransition(async () => {
      setError(null);
      const result = await resizeServerAction(
        { projectId, regionId },
        server.id,
        { flavorRef },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFlavorRef("");
      onOpenChange(false);
      await onComplete();
      const expectedStatuses = new Set([server.status.trim().toUpperCase()]);
      queryClient.setQueryData<Server>(
        [regionId, projectId, "server", server.id],
        (current) =>
          current
            ? markServerTaskStateIfStatus(
                current,
                expectedStatuses,
                "resize_prep",
              )
            : current,
      );
      queryClient.setQueryData<Server[]>(
        [regionId, projectId, "servers"],
        (current) =>
          current
            ? markServersTaskStateIfStatus(
                current,
                new Set([server.id]),
                expectedStatuses,
                "resize_prep",
              )
            : current,
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Resize instance</DialogTitle>
            <DialogDescription>
              Change compute capacity, test the resized instance, then confirm
              or revert the result.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Current flavor</p>
              <p className="mt-1 text-sm font-medium">{currentFlavor.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {server.flavor.vcpus} vCPU ·{" "}
                {formatFlavorRam(server.flavor.ram)} RAM ·{" "}
                {server.flavor.disk} GiB root disk
              </p>
            </div>
            <div className="rounded-md border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Target flavor</p>
              <p className="mt-1 text-sm font-medium">
                {selectedFlavor?.name ?? "Not selected"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedFlavor
                  ? `${selectedFlavor.vcpus} vCPU · ${formatFlavorRam(selectedFlavor.ram)} RAM · ${selectedFlavor.disk} GiB root disk`
                  : "Choose the capacity to apply."}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resize-flavor">New flavor</Label>
            <Select
              value={flavorRef}
              onValueChange={setFlavorRef}
              disabled={pending || flavors.isLoading}
            >
              <SelectTrigger id="resize-flavor">
                <SelectValue
                  placeholder={
                    flavors.isLoading ? "Loading flavors" : "Choose a flavor"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {choices.map((flavor) => (
                  <SelectItem
                    key={flavor.id}
                    value={String(flavor.id)}
                    disabled={Boolean(
                      flavorUnavailableReasons.get(String(flavor.id)),
                    )}
                  >
                    {flavor.name} · {flavor.vcpus} vCPU ·{" "}
                    {formatFlavorRam(flavor.ram)} RAM · {flavor.disk} GiB root
                    disk
                    {flavorUnavailableReasons.get(String(flavor.id))
                      ? ` · ${flavorUnavailableReasons.get(String(flavor.id))}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QuotaImpactPreview
            impacts={quotaImpacts}
            loading={quota.isLoading}
            unavailableMessage={quotaUnavailableMessage}
            title="Compute quota impact"
            description="Only additional vCPU and RAM are projected; the existing instance is already counted in current usage."
          />

          <MutationAlert variant="warning" title="Confirmation required">
            Nova preserves the original instance until you confirm. Ephemeral
            disks are not resized, and root disks cannot shrink. Verify the
            guest and networking before accepting the new flavor.
          </MutationAlert>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
          {quotaIssues.length ? (
            <MutationAlert>{quotaIssues.join(" ")}</MutationAlert>
          ) : null}

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
              disabled={pending || !flavorRef || quotaIssues.length > 0}
            >
              {pending ? <Spinner /> : null}
              {pending ? "Starting resize" : "Resize instance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
