"use client";

import { useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save, UserPlus } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
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
import { visibleSubnetsQueryOptions } from "@/hooks/queries/useNetworks";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import type { MutationScope } from "@/lib/mutations";
import { detectIpVersion } from "@/lib/network-address";
import {
  mutateOctaviaPoolMemberAction,
  type OctaviaMemberMutation,
} from "@/lib/openstack/octavia-actions";
import { formatOctaviaMemberAddress } from "@/lib/openstack/octavia-pool-settings";
import type { OctaviaMember, OctaviaPool } from "@/types/openstack";

export type MemberDialogAction =
  | { action: "create"; pool: OctaviaPool }
  | { action: "edit" | "delete"; pool: OctaviaPool; member: OctaviaMember };

const VIP_SUBNET = "vip";

export function MemberMutationDialog({
  target,
  loadBalancerId,
  scope,
  neutronAvailable,
  onClose,
  onRefresh,
  onSuccess,
}: {
  target: MemberDialogAction;
  loadBalancerId: string;
  scope: MutationScope;
  neutronAvailable: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
}) {
  const creating = target.action === "create";
  const member = creating ? undefined : target.member;
  const [initial] = useState(() => ({
    parentId: loadBalancerId,
    poolId: target.pool.id,
    scope,
    name: member?.name ?? "",
    adminStateUp: member?.admin_state_up ?? true,
    weight: creating ? 1 : (member?.weight ?? undefined),
  }));
  const [name, setName] = useState(initial.name);
  const [adminStateUp, setAdminStateUp] = useState(initial.adminStateUp);
  const [weight, setWeight] = useState(String(initial.weight ?? ""));
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("");
  const [subnetId, setSubnetId] = useState(VIP_SUBNET);
  const [error, setError] = useState<string | null>(null);
  const [requiresReopen, setRequiresReopen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const quota = useProjectQuotaImpact({
    enabled: creating,
    projectId: scope.projectId,
    regionId: scope.regionId,
    requests: [{ metricId: "member", requested: 1 }],
    serviceId: "load-balancing",
  });
  const subnets = useQuery({
    ...visibleSubnetsQueryOptions(scope.regionId, scope.projectId),
    enabled: creating && neutronAvailable && Boolean(scope.regionId),
    retry: false,
  });
  const subnetOptions = subnets.isError ? [] : (subnets.data ?? []);
  const selectedSubnet = subnetOptions.find(({ id }) => id === subnetId);
  const close = () => {
    if (!inFlight.current && !pending) onClose();
  };
  const run = (input: OctaviaMemberMutation) => {
    if (inFlight.current || requiresReopen) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mutateOctaviaPoolMemberAction(
          initial.scope,
          initial.parentId,
          initial.poolId,
          input,
        );
        if (result.ok) {
          onSuccess(result.message);
          return;
        }
        const { code, message } = result.error;
        const unconfirmed =
          code === "invalid-response" || code === "network-error";
        const needsRefresh =
          code === "conflict" || code === "not-found" || unconfirmed;
        const needsReopen =
          code === "context-changed" ||
          code === "not-found" ||
          unconfirmed ||
          (!creating && code === "conflict");
        if (needsRefresh) onRefresh();
        if (needsReopen) setRequiresReopen(true);
        setError(
          needsReopen
            ? `${message} Close this dialog to check the pool before retrying.`
            : message,
        );
      } catch {
        setRequiresReopen(true);
        onRefresh();
        setError(
          "The result could not be confirmed. Close this dialog to check the pool before retrying.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };

  if (target.action === "delete") {
    return (
      <MutationConfirmationDialog
        open
        onOpenChange={(open) => !open && close()}
        title="Remove pool member?"
        description={
          <>
            <span className="wrap-anywhere font-medium">
              {target.member.name || formatOctaviaMemberAddress(target.member)}
            </span>{" "}
            will stop receiving traffic from this pool. The backend itself will
            not be deleted.
          </>
        }
        confirmLabel="Remove member"
        variant="destructive"
        confirmDisabled={requiresReopen}
        pending={pending}
        error={error}
        onConfirm={() => run({ action: "delete", id: target.member.id })}
      />
    );
  }

  const portNumber = Number(port);
  const weightNumber = Number(weight);
  const validAddress =
    /^[a-f0-9:.]+$/i.test(address.trim()) && Boolean(detectIpVersion(address));
  const validPort =
    /^\d+$/.test(port) && portNumber >= 1 && portNumber <= 65535;
  const validWeight =
    initial.weight === undefined ||
    (/^\d+$/.test(weight) && weightNumber <= 256);
  const weightChanged =
    initial.weight !== undefined && weightNumber !== initial.weight;
  const canSubmit =
    !requiresReopen &&
    validWeight &&
    (creating
      ? validAddress &&
        validPort &&
        (subnetId === VIP_SUBNET || Boolean(selectedSubnet)) &&
        quota.issues.length === 0
      : name !== initial.name ||
        adminStateUp !== initial.adminStateUp ||
        weightChanged);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>
            {creating ? "Add pool member" : "Edit pool member"}
          </DialogTitle>
          <DialogDescription>
            {target.pool.name || target.pool.id}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || !canSubmit) return;
            if (target.action === "create") {
              run({
                action: "create",
                name,
                adminStateUp,
                address: address.trim(),
                port: portNumber,
                weight: weightNumber,
                subnetId: selectedSubnet?.id,
              });
            } else if (target.action === "edit") {
              run({
                action: "edit",
                id: target.member.id,
                name,
                adminStateUp,
                ...(weightChanged ? { weight: weightNumber } : {}),
                source: {
                  name: initial.name,
                  adminStateUp: initial.adminStateUp,
                  weight: initial.weight,
                },
              });
            }
          }}
        >
          {error ? (
            <MutationAlert variant="error">{error}</MutationAlert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="octavia-member-name">Name</Label>
            <Input
              id="octavia-member-name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          {creating ? (
            <>
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="octavia-member-address">IP address</Label>
                  <Input
                    id="octavia-member-address"
                    value={address}
                    maxLength={45}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="10.0.0.10"
                    disabled={pending}
                    required
                    aria-invalid={Boolean(address && !validAddress)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="octavia-member-port">Port</Label>
                  <Input
                    id="octavia-member-port"
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    disabled={pending}
                    required
                  />
                </div>
              </div>
              {address && !validAddress ? (
                <p className="text-sm text-destructive">
                  Enter an IPv4 or IPv6 address without a prefix or port.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="octavia-member-subnet">Member subnet</Label>
                <Select
                  value={subnetId}
                  onValueChange={setSubnetId}
                  disabled={
                    pending || (!neutronAvailable && subnetId === VIP_SUBNET)
                  }
                >
                  <SelectTrigger id="octavia-member-subnet" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={VIP_SUBNET}>
                      Load balancer VIP subnet
                    </SelectItem>
                    {subnetId !== VIP_SUBNET && !selectedSubnet ? (
                      <SelectItem value={subnetId} disabled>
                        Selected subnet unavailable
                      </SelectItem>
                    ) : null}
                    {subnetOptions.map((subnet) => (
                      <SelectItem value={subnet.id} key={subnet.id}>
                        {subnet.name
                          ? `${subnet.name} (${subnet.cidr})`
                          : `${subnet.cidr} (${subnet.id})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {subnets.isLoading ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading subnet choices.
                  </p>
                ) : null}
                {subnets.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Subnet choices could not be loaded. The VIP subnet is still
                    available.
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="octavia-member-endpoint">Address and port</Label>
              <Input
                id="octavia-member-endpoint"
                value={
                  target.action === "edit"
                    ? formatOctaviaMemberAddress(target.member)
                    : ""
                }
                readOnly
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="octavia-member-weight">Weight</Label>
            <Input
              id="octavia-member-weight"
              type="number"
              min={0}
              max={256}
              step={1}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              disabled={pending || initial.weight === undefined}
              required={initial.weight !== undefined}
              placeholder={
                initial.weight === undefined ? "Not reported" : undefined
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="octavia-member-admin-state"
              checked={adminStateUp}
              onCheckedChange={(value) => setAdminStateUp(value === true)}
              disabled={pending}
            />
            <Label htmlFor="octavia-member-admin-state">
              Administratively enabled
            </Label>
          </div>
          {creating ? (
            <QuotaImpactPreview
              impacts={quota.impacts}
              loading={quota.loading}
              unavailableMessage={quota.unavailableMessage}
            />
          ) : null}
          {creating && quota.issues.length ? (
            <MutationAlert>{quota.issues.join(" ")}</MutationAlert>
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
            <Button type="submit" loading={pending} disabled={!canSubmit}>
              {creating ? <UserPlus /> : <Save />}
              {creating ? "Add member" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
