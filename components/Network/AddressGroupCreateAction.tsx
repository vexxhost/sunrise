"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ListTree, Plus } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import {
  WizardDialog,
  WizardDialogContent,
  WizardDialogDescription,
  WizardDialogFooter,
  WizardDialogHeader,
  WizardDialogTitle,
  WizardReviewRow,
  WizardReviewStatus,
} from "@/components/ui/wizard-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { detectIpVersion, getCidrPrefixLength } from "@/lib/network-address";
import { createAddressGroupAction } from "@/lib/openstack/neutron-actions";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";

type Step = "addresses" | "details" | "review";

export function addressesFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function addressError(address: string) {
  const [ip, prefix, ...rest] = address.split("/");
  const version = detectIpVersion(ip ?? "");
  if (!version || rest.length > 0) return `Invalid address: ${address}`;
  if (prefix === undefined) return null;
  const prefixLength = getCidrPrefixLength(address);
  if (prefixLength === null || prefixLength > (version === 4 ? 32 : 128)) {
    return `Invalid CIDR: ${address}`;
  }
  return null;
}

export function addressListIssues(addresses: string[]) {
  const issues: string[] = [];
  const invalid = addresses.map(addressError).find(Boolean);
  if (invalid) issues.push(invalid);
  if (
    new Set(addresses.map((address) => address.toLowerCase())).size !==
    addresses.length
  ) {
    issues.push("Remove duplicate address entries.");
  }
  return issues;
}

export function AddressGroupCreateAction({
  initiallyOpen = false,
  projectId,
  regionId,
  support,
}: {
  initiallyOpen?: boolean;
  projectId: string;
  regionId: string;
  support: OpenStackFeatureSupport;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const addresses = useMemo(
    () => addressesFromText(addressText),
    [addressText],
  );
  const issues = useMemo(
    () => [
      ...(!name.trim() ? ["Enter an address group name."] : []),
      ...addressListIssues(addresses),
    ],
    [addresses, name],
  );

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (next) {
      setStep("details");
      setName("");
      setDescription("");
      setAddressText("");
    }
  };
  const submit = () => {
    startTransition(async () => {
      const result = await createAddressGroupAction(
        { projectId, regionId },
        { name, description, addresses },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    });
  };

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        Create address group
      </Button>
      <WizardDialog open={open} onOpenChange={setDialogOpen}>
        <WizardDialogContent className="sm:max-w-2xl">
          <WizardDialogHeader>
            <WizardDialogTitle className="flex items-center gap-2">
              <ListTree className="size-5" />
              Create address group
            </WizardDialogTitle>
            <WizardDialogDescription>
              Maintain reusable IP prefixes for security group rules.
            </WizardDialogDescription>
          </WizardDialogHeader>
          <Tabs
            className="flex min-h-0 flex-1 flex-col px-5 pt-4"
            value={step}
            onValueChange={(value) => setStep(value as Step)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="addresses">Addresses</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto pb-5">
              <TabsContent value="details" className="space-y-4 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="address-group-name">Name</Label>
                  <Input
                    id="address-group-name"
                    autoFocus
                    required
                    maxLength={255}
                    value={name}
                    disabled={pending}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address-group-description">Description</Label>
                  <Textarea
                    id="address-group-description"
                    maxLength={1024}
                    value={description}
                    disabled={pending}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="addresses" className="space-y-2 pt-3">
                <Label htmlFor="address-group-addresses">
                  IP addresses and CIDRs
                </Label>
                <Textarea
                  id="address-group-addresses"
                  className="min-h-44 font-mono"
                  placeholder={"10.20.0.0/16\n192.0.2.10\n2001:db8::/64"}
                  value={addressText}
                  disabled={pending}
                  onChange={(event) => setAddressText(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter one IPv4 or IPv6 address or CIDR per line. You can also
                  separate entries with commas.
                </p>
              </TabsContent>
              <TabsContent value="review" className="space-y-4 pt-3">
                <WizardReviewStatus issues={issues} />
                <dl className="rounded-md border px-4">
                  <WizardReviewRow label="Name" value={name || "-"} />
                  <WizardReviewRow label="Addresses" value={addresses.length} />
                  <WizardReviewRow
                    label="Description"
                    value={description || "None"}
                  />
                </dl>
                {support.status === "unknown" ? (
                  <p className="text-sm text-muted-foreground">
                    {support.message}
                  </p>
                ) : null}
              </TabsContent>
            </div>
          </Tabs>
          {error ? (
            <div className="shrink-0 px-5 pb-4">
              <MutationAlert>{error}</MutationAlert>
            </div>
          ) : null}
          <WizardDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            {step === "review" ? (
              <Button
                type="button"
                loading={pending}
                disabled={issues.length > 0}
                onClick={submit}
              >
                Create address group
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending}
                onClick={() => setStep("review")}
              >
                Review address group
              </Button>
            )}
          </WizardDialogFooter>
        </WizardDialogContent>
      </WizardDialog>
    </>
  );
}
