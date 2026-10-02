"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Plus } from "lucide-react";

import { JsonEditor } from "@/components/JsonEditor";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { QuotaImpactPreview } from "@/components/quotas/QuotaImpactPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  manilaAvailabilityZonesQueryOptions,
  shareNetworksQueryOptions,
  shareTypesQueryOptions,
} from "@/hooks/queries/useManila";
import { createShareAction } from "@/lib/openstack/manila-actions";

const steps = ["details", "placement", "metadata", "review"] as const;
type Step = (typeof steps)[number];

const protocols = ["NFS", "CIFS", "CEPHFS", "GLUSTERFS", "HDFS", "MAPRFS"];

const initialForm = {
  name: "",
  description: "",
  protocol: "NFS",
  size: "1",
  shareType: "default",
  shareNetworkId: "none",
  availabilityZone: "default",
  isPublic: false,
  metadata: "{}",
};

function parseMetadata(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { value: null, errors: ["Metadata must be a JSON object."] };
    }
    const entries = Object.entries(parsed);
    if (entries.some(([key, item]) => !key || typeof item !== "string")) {
      return {
        value: null,
        errors: ["Metadata keys must be non-empty and values must be strings."],
      };
    }
    return {
      value: Object.fromEntries(entries) as Record<string, string>,
      errors: [] as string[],
    };
  } catch (error) {
    return {
      value: null,
      errors: [error instanceof Error ? error.message : "Invalid JSON."],
    };
  }
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

export function ShareActions({
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
  const [types, networks, zones] = useQueries({
    queries: [
      {
        ...shareTypesQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
      {
        ...shareNetworksQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
      {
        ...manilaAvailabilityZonesQueryOptions(regionId, projectId),
        enabled: open && Boolean(regionId && projectId),
      },
    ],
  });
  const metadata = useMemo(() => parseMetadata(form.metadata), [form.metadata]);
  const selectedType = types.data?.find(({ id }) => id === form.shareType);
  const selectedNetwork = networks.data?.find(
    ({ id }) => id === form.shareNetworkId,
  );
  const quota = useProjectQuotaImpact({
    enabled: open,
    projectId,
    regionId,
    requests: [
      { metricId: "shares", requested: 1 },
      { metricId: "gigabytes", requested: Number(form.size) },
    ],
    serviceId: "shared-file-system",
  });
  const reviewIssues = [
    ...(!form.name.trim() ? ["Enter a share name."] : []),
    ...(!Number.isInteger(Number(form.size)) || Number(form.size) <= 0
      ? ["Enter a positive whole-number capacity."]
      : []),
    ...metadata.errors,
    ...quota.issues,
  ];

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

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
    if (
      step !== "review" ||
      !projectId ||
      reviewIssues.length > 0 ||
      !metadata.value
    )
      return;
    startTransition(async () => {
      setError(null);
      const result = await createShareAction(
        { projectId, regionId },
        {
          name: form.name,
          description: form.description || undefined,
          protocol: form.protocol as
            "NFS" | "CIFS" | "CEPHFS" | "GLUSTERFS" | "HDFS" | "MAPRFS",
          size: form.size,
          shareType: form.shareType === "default" ? undefined : form.shareType,
          shareNetworkId:
            form.shareNetworkId === "none" ? undefined : form.shareNetworkId,
          availabilityZone:
            form.availabilityZone === "default"
              ? undefined
              : form.availabilityZone,
          isPublic: form.isPublic,
          metadata: metadata.value,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "shares"],
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
        <Plus className="size-4" />
        Create share
      </Button>

      <WizardDialog open={open} onOpenChange={handleOpenChange}>
        <WizardDialogContent>
          <WizardDialogHeader>
            <WizardDialogTitle className="flex items-center gap-2">
              <FolderPlus className="size-5" />
              Create share
            </WizardDialogTitle>
            <WizardDialogDescription>
              Provision a Manila share in the active project. Review the
              placement and access-sensitive settings before creation.
            </WizardDialogDescription>
          </WizardDialogHeader>

          <Tabs
            value={step}
            onValueChange={(value) => setStep(value as Step)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b px-5 py-3">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="placement">Placement</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="details" className="mt-0 space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="share-name">Name</Label>
                    <Input
                      id="share-name"
                      autoFocus
                      maxLength={255}
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                      placeholder="team-data"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="share-size">Capacity (GiB)</Label>
                    <Input
                      id="share-size"
                      type="number"
                      min={1}
                      step={1}
                      value={form.size}
                      onChange={(event) => update("size", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="share-protocol">Protocol</Label>
                    <Select
                      value={form.protocol}
                      onValueChange={(value) => update("protocol", value)}
                      disabled={pending}
                    >
                      <SelectTrigger id="share-protocol">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {protocols.map((protocol) => (
                          <SelectItem key={protocol} value={protocol}>
                            {protocol}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="share-description">Description</Label>
                    <Textarea
                      id="share-description"
                      maxLength={255}
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                      placeholder="Shared data for the analytics team"
                      disabled={pending}
                    />
                  </div>
                  <label className="flex items-start gap-3 rounded-md border p-3 md:col-span-2">
                    <Checkbox
                      checked={form.isPublic}
                      onCheckedChange={(checked) =>
                        update("isPublic", checked === true)
                      }
                      disabled={pending}
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Public visibility
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Other projects may discover this share. Access still
                        requires an explicit access rule.
                      </span>
                    </span>
                  </label>
                </div>
                <QuotaImpactPreview
                  impacts={quota.impacts}
                  loading={quota.loading}
                  unavailableMessage={quota.unavailableMessage}
                />
              </TabsContent>

              <TabsContent value="placement" className="mt-0 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="share-type">Share type</Label>
                  <Select
                    value={form.shareType}
                    onValueChange={(value) => update("shareType", value)}
                    disabled={pending || types.isLoading}
                  >
                    <SelectTrigger id="share-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Project default</SelectItem>
                      {(types.data ?? []).map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Share types select the backend capabilities and policy used
                    by Manila.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-network">Share network</Label>
                  <Select
                    value={form.shareNetworkId}
                    onValueChange={(value) => update("shareNetworkId", value)}
                    disabled={pending || networks.isLoading}
                  >
                    <SelectTrigger id="share-network">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(networks.data ?? []).map((network) => (
                        <SelectItem key={network.id} value={network.id}>
                          {network.name || network.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Required only by backends that create share servers on a
                    project network.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-zone">Availability zone</Label>
                  <Select
                    value={form.availabilityZone}
                    onValueChange={(value) => update("availabilityZone", value)}
                    disabled={pending || zones.isLoading}
                  >
                    <SelectTrigger id="share-zone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Scheduler default</SelectItem>
                      {(zones.data ?? []).map((zone) => (
                        <SelectItem key={zone.name} value={zone.name}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="metadata" className="mt-0 space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Share metadata</h3>
                  <p className="text-xs text-muted-foreground">
                    Optional string key-value pairs stored with the share.
                  </p>
                </div>
                <JsonEditor
                  label="Share metadata JSON"
                  value={form.metadata}
                  onChange={(value) => update("metadata", value)}
                  errors={metadata.errors}
                  height="280px"
                />
              </TabsContent>

              <TabsContent value="review" className="mt-0 space-y-4">
                <WizardReviewStatus issues={reviewIssues} />
                <div className="overflow-hidden rounded-md border">
                  <ReviewRow label="Name" value={form.name || "-"} />
                  <ReviewRow
                    label="Capacity"
                    value={`${form.size || "-"} GiB`}
                  />
                  <ReviewRow label="Protocol" value={form.protocol} />
                  <ReviewRow
                    label="Share type"
                    value={selectedType?.name ?? "Project default"}
                  />
                  <ReviewRow
                    label="Share network"
                    value={
                      selectedNetwork?.name || selectedNetwork?.id || "None"
                    }
                  />
                  <ReviewRow
                    label="Availability zone"
                    value={
                      form.availabilityZone === "default"
                        ? "Scheduler default"
                        : form.availabilityZone
                    }
                  />
                  <ReviewRow
                    label="Visibility"
                    value={form.isPublic ? "Public" : "Project only"}
                  />
                </div>
                <QuotaImpactPreview
                  impacts={quota.impacts}
                  loading={quota.loading}
                  unavailableMessage={quota.unavailableMessage}
                />
              </TabsContent>

              {error ? <MutationAlert>{error}</MutationAlert> : null}
            </div>

            <WizardDialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              {step === "review" ? (
                <Button
                  type="button"
                  disabled={pending || reviewIssues.length > 0}
                  onClick={create}
                >
                  {pending ? "Creating" : "Create share"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => setStep("review")}
                >
                  Review share
                </Button>
              )}
            </WizardDialogFooter>
          </Tabs>
        </WizardDialogContent>
      </WizardDialog>
    </>
  );
}
