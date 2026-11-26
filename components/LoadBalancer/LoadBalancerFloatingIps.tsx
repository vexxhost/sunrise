"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink2 } from "lucide-react";

import { DetailField } from "@/components/Instance/DetailFields";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
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
import { loadBalancerFloatingIpsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { detectIpVersion } from "@/lib/network-address";
import type { NeutronFloatingIpReference } from "@/lib/openstack/neutron-floating-ip-server";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  isOctaviaAmphoraProvider,
} from "@/lib/openstack/octavia";
import {
  changeOctaviaFloatingIpAssociationAction,
  listOctaviaFloatingIpChoicesAction,
  type OctaviaFloatingIpAssociation,
} from "@/lib/openstack/octavia-floating-ip-actions";
import type { OctaviaLoadBalancer } from "@/types/openstack";

type Target = {
  loadBalancerId: string;
  vipPortId: string;
  vipAddress: string;
  regionId: string;
  projectId: string;
} & (
  | { action: "associate" }
  | { action: "disassociate"; floatingIp: NeutronFloatingIpReference }
);

export function LoadBalancerFloatingIps({
  loadBalancer,
  neutronAvailable,
  revisionPreconditions,
  regionId,
  projectId,
}: {
  loadBalancer: OctaviaLoadBalancer;
  neutronAvailable: boolean;
  revisionPreconditions: boolean;
  regionId: string;
  projectId: string;
}) {
  const { id, vip_port_id: vipPortId, vip_address: vipAddress } = loadBalancer;
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState("");
  const attached = useQuery({
    ...loadBalancerFloatingIpsQueryOptions(
      neutronAvailable ? regionId : undefined,
      neutronAvailable ? projectId : undefined,
      vipPortId,
    ),
    retry: false,
  });
  const canManage =
    revisionPreconditions &&
    neutronAvailable &&
    vipPortId &&
    vipAddress &&
    detectIpVersion(vipAddress) === 4 &&
    isOctaviaAmphoraProvider(loadBalancer.provider);
  const open = (floatingIp?: NeutronFloatingIpReference) => {
    if (!vipPortId || !vipAddress) return;
    setNotice("");
    const base = {
      loadBalancerId: id,
      vipPortId,
      vipAddress,
      regionId,
      projectId,
    };
    setTarget(
      floatingIp
        ? { ...base, action: "disassociate", floatingIp }
        : { ...base, action: "associate" },
    );
  };
  return (
    <DetailField label="Floating IPs">
      <div className="space-y-2">
        {!vipPortId ? (
          "-"
        ) : !neutronAvailable || attached.isError ? (
          <span className="text-muted-foreground">Lookup unavailable.</span>
        ) : attached.isLoading ? (
          <span className="text-muted-foreground">Loading</span>
        ) : attached.data?.length ? (
          <ul className="space-y-1">
            {attached.data.map((floatingIp) => (
              <li
                key={floatingIp.id}
                className="flex flex-wrap items-center gap-x-1"
              >
                <ResourceLink
                  href={`/networking/floating-ips/${encodeURIComponent(floatingIp.id)}`}
                >
                  {floatingIp.floating_ip_address}
                </ResourceLink>
                {canManage && floatingIp.fixed_ip_address === vipAddress ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Disassociate ${floatingIp.floating_ip_address}`}
                    title="Disassociate floating IP"
                    disabled={!canChangeOctaviaListener(loadBalancer)}
                    onClick={() => open(floatingIp)}
                  >
                    <Unlink2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          "None associated"
        )}
        {canManage && !attached.isLoading && !attached.isError ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal"
              disabled={!canChangeOctaviaListeners(loadBalancer)}
              onClick={() => open()}
            >
              <Link2 className="size-4" />
              Associate floating IP
            </Button>
          </div>
        ) : null}
        {notice ? (
          <MutationAlert variant="success">{notice}</MutationAlert>
        ) : null}
      </div>
      {target ? (
        <AssociationDialog
          target={target}
          onClose={() => setTarget(null)}
          onSuccess={(message) => {
            setNotice(message);
            setTarget(null);
          }}
        />
      ) : null}
    </DetailField>
  );
}

function AssociationDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: Target;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { projectId, regionId, loadBalancerId, vipPortId, vipAddress } = target;
  const queryClient = useQueryClient();
  const associating = target.action === "associate";
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const choices = useQuery({
    queryKey: [regionId, projectId, "octavia", "unassociated-floating-ips"],
    queryFn: () => listOctaviaFloatingIpChoicesAction(regionId, projectId),
    enabled: associating,
    staleTime: 0,
    retry: false,
  });
  const selected = choices.data?.find(({ id }) => id === selectedId);
  const close = () => {
    if (!pending && !inFlight.current) onClose();
  };
  const run = (
    action: OctaviaFloatingIpAssociation["action"],
    floatingIpId: string,
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await changeOctaviaFloatingIpAssociationAction(
          { projectId, regionId },
          loadBalancerId,
          { action, floatingIpId, vipAddress, vipPortId },
        );
        if (!result.ok) {
          setError(result.error.message);
          if (result.error.code === "conflict")
            void queryClient.invalidateQueries({
              queryKey: [
                regionId,
                projectId,
                "octavia",
                "unassociated-floating-ips",
              ],
            });
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: [regionId, projectId],
        });
        onSuccess(result.message);
      } catch {
        setError(
          "The result could not be confirmed. Refresh before trying again.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };
  if (target.action === "disassociate") {
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Disassociate floating IP?"
        description={
          <>
            The load balancer will stop receiving traffic at{" "}
            <strong>{target.floatingIp.floating_ip_address}</strong>. The
            address will remain allocated to this project.
          </>
        }
        confirmLabel="Disassociate"
        pending={pending}
        variant="destructive"
        error={error}
        onConfirm={() => run(target.action, target.floatingIp.id)}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Associate floating IP</DialogTitle>
          <DialogDescription>
            Map an allocated address to{" "}
            <span className="font-mono">{vipAddress}</span>. Enabled listeners
            may become reachable from the external network.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected && !choices.isError && !choices.isFetching)
              run("associate", selected.id);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="octavia-floating-ip">Floating IP</Label>
            <Select
              value={selected ? selectedId : ""}
              onValueChange={setSelectedId}
              disabled={
                pending ||
                choices.isFetching ||
                choices.isError ||
                !choices.data?.length
              }
            >
              <SelectTrigger id="octavia-floating-ip" className="w-full">
                <SelectValue placeholder="Select an unassociated address" />
              </SelectTrigger>
              <SelectContent>
                {choices.data?.map(({ id, floating_ip_address }) => (
                  <SelectItem key={id} value={id}>
                    {floating_ip_address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {choices.isError ? (
            <MutationAlert variant="error">
              Unassociated addresses could not be loaded.
            </MutationAlert>
          ) : choices.isFetching ? (
            <p className="text-sm text-muted-foreground">
              Loading addresses...
            </p>
          ) : !choices.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No unassociated addresses.{" "}
              <ResourceLink href="/networking/floating-ips">
                Floating IPs
              </ResourceLink>
            </p>
          ) : null}
          {error ? (
            <MutationAlert variant="error">{error}</MutationAlert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={!selected || choices.isError || choices.isFetching}
            >
              <Link2 className="size-4" /> Associate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
