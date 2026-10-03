"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { createSecurityServiceAction } from "@/lib/openstack/manila-actions";
import type { ManilaSecurityServiceType } from "@/types/openstack";

const steps = ["details", "directory", "review"] as const;
type Step = (typeof steps)[number];

const initialForm = {
  type: "ldap" as ManilaSecurityServiceType,
  name: "",
  description: "",
  dnsIp: "",
  server: "",
  domain: "",
  ou: "",
  user: "",
  password: "",
};

const typeLabels: Record<ManilaSecurityServiceType, string> = {
  ldap: "LDAP",
  kerberos: "Kerberos",
  active_directory: "Active Directory",
};

export function SecurityServiceActions({
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
  const reviewIssues = !form.name.trim()
    ? ["Enter a security service name."]
    : [];

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
    if (step !== "review" || !projectId || !regionId || reviewIssues.length)
      return;
    startTransition(async () => {
      setError(null);
      const result = await createSecurityServiceAction(
        { projectId, regionId },
        form,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "security-services"],
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
        Create security service
      </Button>

      <WizardDialog open={open} onOpenChange={handleOpenChange}>
        <WizardDialogContent className="sm:max-w-3xl">
          <WizardDialogHeader>
            <WizardDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" aria-hidden="true" />
              Create security service
            </WizardDialogTitle>
            <WizardDialogDescription>
              Store the directory or authentication settings a Manila share
              server needs to join your environment.
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
                <TabsTrigger value="directory">Configuration</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="details" className="mt-0 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="security-service-type">Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(value) =>
                      update("type", value as ManilaSecurityServiceType)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger id="security-service-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security-service-name">Name</Label>
                  <Input
                    id="security-service-name"
                    autoFocus
                    maxLength={255}
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="team-directory"
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security-service-description">
                    Description
                  </Label>
                  <Textarea
                    id="security-service-description"
                    maxLength={255}
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    disabled={pending}
                  />
                </div>
              </TabsContent>

              <TabsContent value="directory" className="mt-0 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-server">Server</Label>
                    <Input
                      id="security-service-server"
                      value={form.server}
                      onChange={(event) => update("server", event.target.value)}
                      placeholder="directory.example.com"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-dns">DNS address</Label>
                    <Input
                      id="security-service-dns"
                      value={form.dnsIp}
                      onChange={(event) => update("dnsIp", event.target.value)}
                      placeholder="192.0.2.53"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-domain">Domain</Label>
                    <Input
                      id="security-service-domain"
                      value={form.domain}
                      onChange={(event) => update("domain", event.target.value)}
                      placeholder="example.com"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-ou">
                      Organizational unit
                    </Label>
                    <Input
                      id="security-service-ou"
                      value={form.ou}
                      onChange={(event) => update("ou", event.target.value)}
                      placeholder="OU=File Servers"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-user">User</Label>
                    <Input
                      id="security-service-user"
                      value={form.user}
                      onChange={(event) => update("user", event.target.value)}
                      autoComplete="off"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-service-password">Password</Label>
                    <Input
                      id="security-service-password"
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        update("password", event.target.value)
                      }
                      autoComplete="new-password"
                      disabled={pending}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configuration fields are optional because their requirements
                  depend on the selected security-service type and backend.
                  Passwords are sent directly to Manila and are never displayed
                  again by Sunrise.
                </p>
              </TabsContent>

              <TabsContent value="review" className="mt-0 space-y-4">
                <WizardReviewStatus issues={reviewIssues} />
                <dl className="overflow-hidden rounded-md border px-3">
                  <WizardReviewRow label="Type" value={typeLabels[form.type]} />
                  <WizardReviewRow label="Name" value={form.name || "-"} />
                  <WizardReviewRow
                    label="Description"
                    value={form.description || "-"}
                  />
                  <WizardReviewRow label="Server" value={form.server || "-"} />
                  <WizardReviewRow
                    label="DNS address"
                    value={form.dnsIp || "-"}
                  />
                  <WizardReviewRow label="Domain" value={form.domain || "-"} />
                  <WizardReviewRow label="User" value={form.user || "-"} />
                  <WizardReviewRow
                    label="Password"
                    value={form.password ? "Provided" : "Not provided"}
                  />
                </dl>
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
                {step !== "review" ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => setStep("review")}
                  >
                    Review security service
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={pending || reviewIssues.length > 0}
                    onClick={create}
                  >
                    {pending ? "Creating" : "Create security service"}
                  </Button>
                )}
              </div>
            </WizardDialogFooter>
          </Tabs>
        </WizardDialogContent>
      </WizardDialog>
    </>
  );
}
