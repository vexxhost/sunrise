"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Plus, Share2 } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WizardDialog,
  WizardDialogContent,
  WizardDialogDescription,
  WizardDialogFooter,
  WizardDialogHeader,
  WizardDialogTitle,
  WizardReviewStatus,
} from "@/components/ui/wizard-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { useProjectQuotaImpact } from "@/hooks/queries/useQuotas";
import {
  projectNetworksQueryOptions,
  subnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { manilaAvailabilityZonesQueryOptions } from "@/hooks/queries/useManila";
import { createShareNetworkAction } from "@/lib/openstack/manila-actions";

const steps = ["details", "placement", "review"] as const;
type Step = (typeof steps)[number];

const initialForm = {
  name: "",
  description: "",
  networkId: "none",
  subnetId: "none",
  availabilityZone: "default",
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

export function ShareNetworkActions({
  initiallyOpen = false,
  projectId,
  regionId,
}: {
  initiallyOpen?: boolean;
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const clearCreateActionIntent = useClearCreateActionIntent();
  const [open, setOpen] = useState(initiallyOpen);
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [networks, subnets, zones] = useQueries({
    queries: [
      {
        ...projectNetworksQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
      {
        ...subnetsQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
      {
        ...manilaAvailabilityZonesQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
    ],
  });
  const availableNetworks = useMemo(
    () =>
      (networks.data ?? []).filter((network) => !network["router:external"]),
    [networks.data],
  );
  const availableSubnets = useMemo(
    () =>
      form.networkId === "none"
        ? []
        : (subnets.data ?? []).filter(
            (subnet) => subnet.network_id === form.networkId,
          ),
    [form.networkId, subnets.data],
  );
  const selectedNetwork = availableNetworks.find(
    (network) => network.id === form.networkId,
  );
  const selectedSubnet = availableSubnets.find(
    (subnet) => subnet.id === form.subnetId,
  );
  const placementValid = form.networkId === "none" || form.subnetId !== "none";
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [{ metricId: "share_networks", requested: 1 }],
    serviceId: "shared-file-system",
  });
  const reviewIssues = [
    ...(!form.name.trim() ? ["Enter a share network name."] : []),
    ...(!placementValid
      ? ["Select a subnet for the chosen Neutron network."]
      : []),
    ...quota.issues,
  ];

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const setNetwork = (networkId: string) => {
    setForm((current) => ({
      ...current,
      networkId,
      subnetId: "none",
    }));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending) return;
    setOpen(nextOpen);
    setError(null);
    if (!nextOpen) {
      setStep("details");
      setForm(initialForm);
      clearCreateActionIntent();
    }
  };

  const create = () => {
    if (step !== "review" || !projectId || !regionId || reviewIssues.length > 0)
      return;
    startTransition(async () => {
      setError(null);
      const result = await createShareNetworkAction(
        { projectId, regionId },
        {
          name: form.name,
          description: form.description,
          neutronNetworkId:
            form.networkId === "none" ? undefined : form.networkId,
          neutronSubnetId: form.subnetId === "none" ? undefined : form.subnetId,
          availabilityZone:
            form.availabilityZone === "default"
              ? undefined
              : form.availabilityZone,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share-networks"],
      });
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "project-quotas", "shared-file-system"],
      });
      handleOpenChange(false);
    });
  };

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Create share network
      </Button>

      <WizardDialog open={open} onOpenChange={handleOpenChange}>
        <WizardDialogContent className="sm:max-w-3xl">
          <WizardDialogHeader>
            <WizardDialogTitle className="flex items-center gap-2">
              <Share2 className="size-5" aria-hidden="true" />
              Create share network
            </WizardDialogTitle>
            <WizardDialogDescription>
              Define the project network context Manila will use for share
              servers. You can also let Manila create a service-managed default
              subnet.
            </WizardDialogDescription>
          </WizardDialogHeader>

          <Tabs
            value={step}
            onValueChange={(value) => setStep(value as Step)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b px-5 py-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="placement">Placement</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="details" className="mt-0 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="share-network-name">Name</Label>
                  <Input
                    id="share-network-name"
                    autoFocus
                    maxLength={255}
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="team-share-network"
                    disabled={pending}
                  />
                </div>
                <QuotaImpactPreview
                  impacts={quota.impacts}
                  loading={quota.loading}
                  unavailableMessage={quota.unavailableMessage}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="share-network-description">Description</Label>
                  <Textarea
                    id="share-network-description"
                    maxLength={255}
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    placeholder="Network placement for team file shares"
                    disabled={pending}
                  />
                </div>
              </TabsContent>

              <TabsContent value="placement" className="mt-0 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="share-network-neutron-network">
                    Neutron network
                  </Label>
                  <Select
                    value={form.networkId}
                    onValueChange={setNetwork}
                    disabled={pending || networks.isLoading}
                  >
                    <SelectTrigger id="share-network-neutron-network">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Service-managed default
                      </SelectItem>
                      {availableNetworks.map((network) => (
                        <SelectItem key={network.id} value={network.id}>
                          {network.name || network.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose a private network owned by this project, or leave the
                    placement automatic for a default subnet without a Neutron
                    allocation.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="share-network-neutron-subnet">
                    Neutron subnet
                  </Label>
                  <Select
                    value={form.subnetId}
                    onValueChange={(value) => update("subnetId", value)}
                    disabled={
                      pending || subnets.isLoading || form.networkId === "none"
                    }
                  >
                    <SelectTrigger id="share-network-neutron-subnet">
                      <SelectValue
                        placeholder={
                          form.networkId === "none"
                            ? "Select a network first"
                            : "Choose a subnet"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubnets.map((subnet) => (
                        <SelectItem key={subnet.id} value={subnet.id}>
                          {subnet.name || subnet.cidr} · {subnet.cidr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.networkId !== "none" &&
                  !subnets.isLoading &&
                  availableSubnets.length === 0 ? (
                    <p className="text-xs text-destructive">
                      The selected network has no project subnets available to
                      Manila.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="share-network-zone">Availability zone</Label>
                  <Select
                    value={form.availabilityZone}
                    onValueChange={(value) => update("availabilityZone", value)}
                    disabled={pending || zones.isLoading}
                  >
                    <SelectTrigger id="share-network-zone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">All storage zones</SelectItem>
                      {(zones.data ?? []).map((zone) => (
                        <SelectItem
                          key={zone.id || zone.name}
                          value={zone.name}
                        >
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Blank creates the single default subnet across Manila
                    storage availability zones.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="review" className="mt-0 space-y-4">
                <WizardReviewStatus issues={reviewIssues} />
                <div className="overflow-hidden rounded-md border">
                  <ReviewRow label="Name" value={form.name || "-"} />
                  <ReviewRow
                    label="Description"
                    value={form.description || "-"}
                  />
                  <ReviewRow
                    label="Neutron network"
                    value={
                      selectedNetwork?.name ||
                      selectedNetwork?.id ||
                      "Service-managed default"
                    }
                  />
                  <ReviewRow
                    label="Neutron subnet"
                    value={
                      selectedSubnet
                        ? `${selectedSubnet.name || selectedSubnet.id} (${selectedSubnet.cidr})`
                        : "Service-managed default"
                    }
                  />
                  <ReviewRow
                    label="Availability zone"
                    value={
                      form.availabilityZone === "default"
                        ? "All storage zones"
                        : form.availabilityZone
                    }
                  />
                </div>
                <QuotaImpactPreview
                  impacts={quota.impacts}
                  loading={quota.loading}
                  unavailableMessage={quota.unavailableMessage}
                />
                <p className="text-xs text-muted-foreground">
                  Manila creates an initial share-network subnet with this
                  placement. Additional availability-zone subnets can be added
                  in a later lifecycle iteration.
                </p>
              </TabsContent>

              {error ? <MutationAlert>{error}</MutationAlert> : null}
            </div>

            <WizardDialogFooter>
              <div className="flex w-full items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <div className="flex gap-2">
                  {step !== "review" ? (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => setStep("review")}
                    >
                      Review share network
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={pending || reviewIssues.length > 0}
                      onClick={create}
                    >
                      {pending ? "Creating" : "Create share network"}
                    </Button>
                  )}
                </div>
              </div>
            </WizardDialogFooter>
          </Tabs>
        </WizardDialogContent>
      </WizardDialog>
    </>
  );
}
