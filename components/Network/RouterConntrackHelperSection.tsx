"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wrench } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { Badge } from "@/components/ui/badge";
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
import { routerConntrackHelpersQueryOptions } from "@/hooks/queries/useNetworks";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  createRouterConntrackHelperAction,
  deleteRouterConntrackHelperAction,
  updateRouterConntrackHelperAction,
} from "@/lib/openstack/neutron-router-conntrack-helper-actions";
import {
  NEUTRON_CONNTRACK_HELPER_PROTOCOLS,
  neutronConntrackHelperProtocolLabel,
  type NeutronConntrackHelperProtocol,
} from "@/lib/openstack/neutron-router-conntrack-helpers";
import type { RouterConntrackHelper } from "@/types/openstack";

type DialogState =
  | { kind: "create" }
  | { kind: "delete"; helper: RouterConntrackHelper }
  | { kind: "edit"; helper: RouterConntrackHelper }
  | null;

function knownProtocol(value: string): NeutronConntrackHelperProtocol {
  return NEUTRON_CONNTRACK_HELPER_PROTOCOLS.includes(
    value as NeutronConntrackHelperProtocol,
  )
    ? (value as NeutronConntrackHelperProtocol)
    : "tcp";
}

export function RouterConntrackHelperSection({
  owned,
  projectId,
  regionId,
  routerId,
  support,
}: {
  owned: boolean;
  projectId: string;
  regionId: string;
  routerId: string;
  support: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...routerConntrackHelpersQueryOptions(regionId, projectId, routerId),
    enabled: owned && support.status !== "unsupported",
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [helperName, setHelperName] = useState("");
  const [port, setPort] = useState("");
  const [protocol, setProtocol] =
    useState<NeutronConntrackHelperProtocol>("tcp");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedHelper =
    dialog?.kind === "edit" || dialog?.kind === "delete" ? dialog.helper : null;
  const parsedPort = Number(port);
  const validPort =
    Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535;
  const duplicate = Boolean(
    query.data?.some(
      (candidate) =>
        candidate.id !== selectedHelper?.id &&
        candidate.helper === helperName.trim() &&
        candidate.port === parsedPort &&
        candidate.protocol === protocol,
    ),
  );
  const unchanged = Boolean(
    selectedHelper &&
    selectedHelper.helper === helperName.trim() &&
    selectedHelper.port === parsedPort &&
    selectedHelper.protocol === protocol,
  );

  const resetForm = (helper?: RouterConntrackHelper) => {
    setHelperName(helper?.helper ?? "");
    setPort(helper ? String(helper.port) : "");
    setProtocol(knownProtocol(helper?.protocol ?? "tcp"));
    setError(null);
  };
  const openCreate = () => {
    resetForm();
    setDialog({ kind: "create" });
  };
  const openEdit = (helper: RouterConntrackHelper) => {
    resetForm(helper);
    setDialog({ kind: "edit", helper });
  };
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "router-conntrack-helpers", routerId],
    });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (duplicate) {
      setError("This exact conntrack helper is already configured.");
      return;
    }
    startTransition(async () => {
      const input = { helper: helperName, port: parsedPort, protocol };
      const result =
        dialog?.kind === "edit"
          ? await updateRouterConntrackHelperAction(
              { projectId, regionId },
              routerId,
              dialog.helper.id,
              input,
            )
          : await createRouterConntrackHelperAction(
              { projectId, regionId },
              routerId,
              input,
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
    if (dialog?.kind !== "delete") return;
    startTransition(async () => {
      const result = await deleteRouterConntrackHelperAction(
        { projectId, regionId },
        routerId,
        dialog.helper.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };

  if (support.status === "unsupported") {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Conntrack helpers</h3>
        </div>
        <MutationAlert variant="info" title="Conntrack helpers unavailable">
          {support.message}
        </MutationAlert>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Conntrack helpers</h3>
          <Badge variant="outline">{query.data?.length ?? 0}</Badge>
        </div>
        {owned ? (
          <Button
            size="sm"
            variant="outline"
            onClick={openCreate}
            disabled={query.data === undefined}
          >
            <Plus className="size-4" />
            Add helper
          </Button>
        ) : null}
      </div>
      {support.status === "unknown" ? (
        <MutationAlert variant="info" title="Support could not be verified">
          {support.message}
        </MutationAlert>
      ) : null}
      {!owned ? (
        <MutationAlert variant="info" title="Read-only context">
          Conntrack helpers are shown only for routers owned by the active
          project.
        </MutationAlert>
      ) : query.isError ? (
        <MutationAlert title="Conntrack helpers could not be loaded">
          {query.error instanceof Error
            ? query.error.message
            : "Refresh and try again."}
        </MutationAlert>
      ) : query.isLoading ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Loading conntrack helpers...
        </div>
      ) : query.data?.length ? (
        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[minmax(9rem,1fr)_minmax(7rem,0.7fr)_minmax(6rem,0.5fr)_5rem] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Helper</span>
            <span>Protocol</span>
            <span>Port</span>
            <span />
          </div>
          {query.data.map((helper) => (
            <div
              key={helper.id}
              className="grid gap-2 px-3 py-2.5 text-sm not-last:border-b sm:grid-cols-[minmax(9rem,1fr)_minmax(7rem,0.7fr)_minmax(6rem,0.5fr)_5rem] sm:items-center sm:gap-0"
            >
              <span className="break-words font-medium">{helper.helper}</span>
              <span>
                {neutronConntrackHelperProtocolLabel(
                  knownProtocol(helper.protocol),
                )}
              </span>
              <span className="font-mono text-xs">{helper.port}</span>
              <span className="flex items-center sm:justify-end">
                <EditActionButton
                  compact
                  label="Edit conntrack helper"
                  onClick={() => openEdit(helper)}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  tone="danger"
                  title="Delete conntrack helper"
                  onClick={() => {
                    setError(null);
                    setDialog({ kind: "delete", helper });
                  }}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Delete conntrack helper</span>
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No conntrack helpers are configured on this router.
        </div>
      )}
      <Dialog
        open={dialog?.kind === "create" || dialog?.kind === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "edit"
                  ? "Edit conntrack helper"
                  : "Add conntrack helper"}
              </DialogTitle>
              <DialogDescription>
                Track related connections for protocols such as FTP, TFTP, or
                SIP through this router.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="conntrack-helper-name">Helper</Label>
                <Input
                  id="conntrack-helper-name"
                  required
                  maxLength={64}
                  placeholder="ftp"
                  value={helperName}
                  disabled={pending}
                  onChange={(event) => setHelperName(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Allowed helper and protocol combinations are configured by the
                  cloud operator.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conntrack-helper-protocol">Protocol</Label>
                <Select
                  value={protocol}
                  disabled={pending}
                  onValueChange={(value) =>
                    setProtocol(value as NeutronConntrackHelperProtocol)
                  }
                >
                  <SelectTrigger id="conntrack-helper-protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEUTRON_CONNTRACK_HELPER_PROTOCOLS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {neutronConntrackHelperProtocolLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conntrack-helper-port">Port</Label>
                <Input
                  id="conntrack-helper-port"
                  type="number"
                  min={1}
                  max={65_535}
                  required
                  placeholder="21"
                  value={port}
                  disabled={pending}
                  onChange={(event) => setPort(event.target.value)}
                />
              </div>
            </div>
            {duplicate ? (
              <MutationAlert>
                This exact conntrack helper is already configured.
              </MutationAlert>
            ) : error ? (
              <MutationAlert>{error}</MutationAlert>
            ) : null}
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
                loading={pending}
                disabled={
                  !helperName.trim() ||
                  !validPort ||
                  duplicate ||
                  (dialog?.kind === "edit" && unchanged)
                }
              >
                {dialog?.kind === "edit" ? "Save changes" : "Add helper"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete conntrack helper?"
        description="Related protocol connections through this router may stop working."
        confirmLabel="Delete helper"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        {selectedHelper ? (
          <div className="grid grid-cols-3 gap-3 rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">{selectedHelper.helper}</span>
            <span className="text-muted-foreground">
              {neutronConntrackHelperProtocolLabel(
                knownProtocol(selectedHelper.protocol),
              )}
            </span>
            <span className="font-mono text-xs">{selectedHelper.port}</span>
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </section>
  );
}
