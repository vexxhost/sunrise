"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { JsonEditor } from "@/components/JsonEditor";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  WizardDialog,
  WizardDialogContent,
  WizardDialogDescription,
  WizardDialogFooter,
  WizardDialogHeader,
  WizardDialogTitle,
  WizardReviewStatus,
} from "@/components/ui/wizard-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  applicationCredentialNameSchema,
  parseAccessRulesJson,
} from "@/lib/openstack/application-credential-schema";
import { createApplicationCredentialAction } from "@/lib/openstack/application-credential-actions";
import type { MutationScope } from "@/lib/mutations";
import type {
  CreatedApplicationCredential,
  KeystoneRole,
} from "@/types/openstack";

const steps = ["details", "roles", "access", "review"] as const;
type Step = (typeof steps)[number];

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value}</div>
    </div>
  );
}

export function ApplicationCredentialCreateSheet({
  onCreated,
  onOpenChange,
  open,
  roles,
  scope,
  serviceTypes,
}: {
  onCreated: (
    credential: CreatedApplicationCredential,
    message: string,
  ) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  roles: KeystoneRole[];
  scope: MutationScope;
  serviceTypes: string[];
}) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiration, setExpiration] = useState("");
  const [expirationError, setExpirationError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [roleMode, setRoleMode] = useState<"all" | "selected">("all");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [accessRules, setAccessRules] = useState("[]");
  const [unrestricted, setUnrestricted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameResult = applicationCredentialNameSchema.safeParse(name);
  const accessRulesResult = useMemo(
    () => parseAccessRulesJson(accessRules),
    [accessRules],
  );
  const expirationDate = expiration ? new Date(expiration) : null;
  const rolesError =
    roleMode === "selected" && selectedRoleIds.length === 0
      ? "Select at least one role."
      : null;
  const reviewIssues = [
    ...(!nameResult.success
      ? nameResult.error.issues.map((issue) => issue.message)
      : []),
    ...(expirationError ? [expirationError] : []),
    ...(rolesError ? [rolesError] : []),
    ...(accessRulesResult.ok ? [] : accessRulesResult.errors),
  ];
  const validationError = reviewIssues[0] ?? null;
  const selectedRoles = roles.filter(({ id }) => selectedRoleIds.includes(id));

  const reset = () => {
    setStep("details");
    setName("");
    setDescription("");
    setExpiration("");
    setExpirationError(null);
    setSecret("");
    setShowSecret(false);
    setRoleMode("all");
    setSelectedRoleIds([]);
    setAccessRules("[]");
    setUnrestricted(false);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const create = async () => {
    if (pending || validationError || !accessRulesResult.ok) return;
    setPending(true);
    setError(null);
    const result = await createApplicationCredentialAction(scope, {
      name,
      description: description || undefined,
      secret: secret || undefined,
      expiresAt: expirationDate?.toISOString(),
      roleIds: roleMode === "selected" ? selectedRoleIds : undefined,
      accessRules: accessRulesResult.value,
      unrestricted,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    await onCreated(result.data, result.message);
    handleOpenChange(false);
  };

  return (
    <WizardDialog open={open} onOpenChange={handleOpenChange}>
      <WizardDialogContent>
        <WizardDialogHeader>
          <WizardDialogTitle>Create application credential</WizardDialogTitle>
          <WizardDialogDescription>
            Create a non-interactive credential scoped to the active project.
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
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="access">Access rules</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="details" className="mt-0 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="application-credential-name">Name</Label>
                <Input
                  id="application-credential-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="ci-deployer"
                  autoComplete="off"
                  aria-invalid={!nameResult.success && name ? true : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Names are unique for your Keystone user.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="application-credential-description">
                  Description
                </Label>
                <Textarea
                  id="application-credential-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Used by the deployment pipeline"
                  maxLength={255}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="application-credential-expiration">
                    Expiration
                  </Label>
                  <Input
                    id="application-credential-expiration"
                    type="datetime-local"
                    value={expiration}
                    onChange={(event) => {
                      const value = event.target.value;
                      const date = value ? new Date(value) : null;
                      const invalid =
                        date &&
                        (Number.isNaN(date.getTime()) ||
                          date.getTime() <= Date.now());
                      setExpiration(value);
                      setExpirationError(
                        invalid ? "Expiration must be in the future." : null,
                      );
                    }}
                    aria-invalid={expirationError ? true : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Your browser time is converted to UTC.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="application-credential-secret">
                    Custom secret
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="application-credential-secret"
                      type={showSecret ? "text" : "password"}
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      placeholder="Generated when blank"
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setShowSecret((current) => !current)}
                      title={showSecret ? "Hide secret" : "Show secret"}
                    >
                      {showSecret ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                      <span className="sr-only">
                        {showSecret ? "Hide secret" : "Show secret"}
                      </span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use a strong server-generated secret.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="roles" className="mt-0 space-y-5">
              <RadioGroup
                value={roleMode}
                onValueChange={(value) =>
                  setRoleMode(value as "all" | "selected")
                }
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="all" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">
                      All current roles
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Keystone copies every role from the current project token.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="selected" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">
                      Selected roles
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Limit the credential to a subset of your assigned roles.
                    </span>
                  </span>
                </label>
              </RadioGroup>

              {roleMode === "selected" ? (
                <div className="overflow-hidden rounded-md border">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedRoleIds.includes(role.id)}
                        onCheckedChange={(checked) =>
                          setSelectedRoleIds((current) =>
                            checked
                              ? [...new Set([...current, role.id])]
                              : current.filter((id) => id !== role.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {role.name}
                      </span>
                      <span className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                        {role.id}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              {rolesError ? <MutationAlert>{rolesError}</MutationAlert> : null}
            </TabsContent>

            <TabsContent value="access" className="mt-0 space-y-5">
              <div>
                <h3 className="text-sm font-medium">Access rules</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Optional JSON restrictions. Use a catalog service type, HTTP
                  method, and API path. Paths support named placeholders,
                  <code className="mx-1">*</code>, and
                  <code className="ml-1">**</code> wildcards.
                </p>
              </div>
              <JsonEditor
                label="Application credential access rules"
                value={accessRules}
                onChange={setAccessRules}
                errors={accessRulesResult.ok ? [] : accessRulesResult.errors}
                height="260px"
              />
              <p className="break-words text-xs text-muted-foreground">
                Catalog service types:{" "}
                {serviceTypes.join(", ") || "None reported"}
              </p>

              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={unrestricted}
                  onCheckedChange={(checked) =>
                    setUnrestricted(checked === true)
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Allow credential delegation
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Permit this credential to create and delete other
                    application credentials and trusts.
                  </span>
                </span>
              </label>
              {unrestricted ? (
                <MutationAlert variant="warning" title="Elevated credential">
                  Delegation can create additional credentials. Enable it only
                  when the workload explicitly requires that authority.
                </MutationAlert>
              ) : null}
            </TabsContent>

            <TabsContent value="review" className="mt-0 space-y-5">
              <WizardReviewStatus issues={reviewIssues} />
              <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-4">
                <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Review credential scope</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The secret is displayed once after creation and cannot be
                    recovered later.
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-md border">
                <ReviewRow label="Name" value={name || "-"} />
                <ReviewRow
                  label="Expiration"
                  value={expirationDate?.toISOString() ?? "Does not expire"}
                />
                <ReviewRow
                  label="Roles"
                  value={
                    roleMode === "all"
                      ? `All ${roles.length} current roles`
                      : selectedRoles
                          .map(({ name: roleName }) => roleName)
                          .join(", ") || "-"
                  }
                />
                <ReviewRow
                  label="Access rules"
                  value={
                    accessRulesResult.ok
                      ? `${accessRulesResult.value.length} configured`
                      : "Invalid"
                  }
                />
                <ReviewRow
                  label="Delegation"
                  value={unrestricted ? "Allowed" : "Blocked"}
                />
                <ReviewRow
                  label="Secret"
                  value={secret ? "Custom secret" : "Generated by Keystone"}
                />
              </div>
              {error ? <MutationAlert>{error}</MutationAlert> : null}
            </TabsContent>
          </div>
        </Tabs>

        <WizardDialogFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            {step !== "review" ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => setStep("review")}
              >
                Review application credential
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending || reviewIssues.length > 0}
                onClick={() => void create()}
              >
                {pending ? <Spinner /> : <KeyRound className="size-4" />}
                {pending ? "Creating" : "Create application credential"}
              </Button>
            )}
          </div>
        </WizardDialogFooter>
      </WizardDialogContent>
    </WizardDialog>
  );
}
