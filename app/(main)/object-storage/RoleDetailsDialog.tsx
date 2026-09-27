"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  Link2,
  LoaderCircle,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Unlink,
} from "lucide-react";
import { JsonEditor } from "@/components/JsonEditor";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  validateIamPermissionPolicyJson,
  validateIamTrustPolicyJson,
} from "@/lib/json-document";
import type { MutationResult, MutationScope } from "@/lib/mutations";
import {
  attachIamManagedRolePolicy,
  deleteIamInlineRolePolicy,
  detachIamManagedRolePolicy,
  getAccessRoleDetails,
  getRoleDetails,
  putIamInlineRolePolicy,
  updateIamRoleSessionDuration,
  updateIamRoleTags,
  updateIamRoleTrustPolicy,
  type AccessRoleDetailsResult,
  type IamRoleTag,
} from "@/lib/s3/role-actions";
import {
  defaultIamPermissionPolicy,
  isSupportedRgwManagedPolicy,
  RGW_MANAGED_POLICIES,
  validateIamPolicyName,
  validateIamRoleTags,
} from "@/lib/s3/role-policy";

function formatSessionDuration(seconds: number | null) {
  if (seconds === null) return "-";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value}</div>
    </div>
  );
}

type LoadedRole = Extract<AccessRoleDetailsResult, { ok: true }>;
type RoleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; details: LoadedRole }
  | { status: "error"; error: string };

type RoleDetailsDialogProps = {
  roleName?: string;
  roleArn?: string;
  scope?: MutationScope;
  trigger?: ReactNode;
  onChanged?: () => Promise<void> | void;
};

function startObjectStorageLogin() {
  window.location.assign(
    new URL("/object-storage/auth/login", window.location.origin).toString(),
  );
}

export function RoleDetailsDialog({
  roleName,
  roleArn,
  scope,
  trigger,
  onChanged,
}: RoleDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [roleState, setRoleState] = useState<RoleState>({ status: "idle" });
  const [trustDraft, setTrustDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("3600");
  const [tagDrafts, setTagDrafts] = useState<IamRoleTag[]>([]);
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyDocument, setNewPolicyDocument] = useState(() =>
    defaultIamPermissionPolicy(),
  );
  const [attachPolicyArn, setAttachPolicyArn] = useState("");
  const [deletePolicyName, setDeletePolicyName] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const isAccessRole = !roleName;

  const applyDetails = (details: LoadedRole) => {
    setRoleState({ status: "loaded", details });
    setTrustDraft(details.assumeRolePolicy ?? "");
    setDurationDraft(String(details.maxSessionDuration ?? 3600));
    setTagDrafts(details.tags.map((tag) => ({ ...tag })));
    setInlineDrafts(
      Object.fromEntries(
        details.inlinePolicies.flatMap((policy) =>
          policy.document ? [[policy.name, policy.document]] : [],
        ),
      ),
    );
  };

  const loadRole = async (showLoading = true) => {
    if (showLoading) setRoleState({ status: "loading" });
    const result = roleName
      ? await getRoleDetails(roleName, roleArn ?? "")
      : await getAccessRoleDetails();

    if (result.ok) {
      applyDetails(result);
      return;
    }

    setRoleState({
      status: "error",
      error: result.needsAuth
        ? "Object storage credentials are missing or expired."
        : result.error,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pendingAction) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setChanged(false);
      setMessage(null);
      setError(null);
      void loadRole();
    } else if (changed) {
      setChanged(false);
      void onChanged?.();
    }
  };

  const runMutation = async <T,>(
    actionName: string,
    action: () => Promise<MutationResult<T>>,
  ) => {
    if (pendingAction) return false;
    setPendingAction(actionName);
    setMessage(null);
    setError(null);
    const result = await action();
    setPendingAction(null);

    if (!result.ok) {
      if (result.error.code === "authentication-required") {
        startObjectStorageLogin();
        return false;
      }
      setError(result.error.message);
      return false;
    }

    setMessage(result.message);
    setChanged(true);
    await loadRole(false);
    return true;
  };

  const details = roleState.status === "loaded" ? roleState.details : null;
  const canMutate = Boolean(scope && details && !details.isActiveRole);
  const canEditTags = Boolean(canMutate && details?.tagsAvailable);
  const trustValidation = validateIamTrustPolicyJson(trustDraft);
  const newPolicyValidation =
    validateIamPermissionPolicyJson(newPolicyDocument);
  const tagError = validateIamRoleTags(
    tagDrafts.map((tag) => ({
      key: tag.key.trim(),
      value: tag.value.trim(),
    })),
  );
  const availableManagedPolicies = RGW_MANAGED_POLICIES.filter(
    (policy) =>
      !details?.attachedPolicies.some(
        (attached) => attached.arn === policy.arn,
      ),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <ShieldCheck />
            Access role
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {isAccessRole ? "Access role" : "Role details"}
          </DialogTitle>
          <DialogDescription>
            {isAccessRole
              ? "IAM role used for the active OpenStack project"
              : roleName}
          </DialogDescription>
        </DialogHeader>

        {roleState.status === "loading" ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="animate-spin" />
            Loading role
          </div>
        ) : null}

        {roleState.status === "error" ? (
          <MutationAlert title="Role check failed">
            {roleState.error}
          </MutationAlert>
        ) : null}

        {details ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            {details.isActiveRole ? (
              <MutationAlert variant="warning" title="Current access role">
                This role supplies the active Object Storage session. It is
                read-only here so Sunrise cannot revoke its own access.
              </MutationAlert>
            ) : null}

            {details.warnings.length > 0 ? (
              <MutationAlert
                variant="warning"
                title="Some role details are unavailable"
              >
                <ul className="list-disc space-y-1 pl-5">
                  {details.warnings.map((warning) => (
                    <li key={warning} className="break-words">
                      {warning}
                    </li>
                  ))}
                </ul>
              </MutationAlert>
            ) : null}

            {message ? (
              <MutationAlert variant="success">{message}</MutationAlert>
            ) : null}
            {error ? <MutationAlert>{error}</MutationAlert> : null}

            <Tabs
              defaultValue="overview"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <TabsList className="grid w-full shrink-0 grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trust-policy">Trust policy</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
                <TabsContent value="overview" className="space-y-4">
                  <div className="overflow-hidden rounded-md border">
                    <DetailRow label="Name" value={details.roleName} />
                    <DetailRow
                      label="ARN"
                      value={
                        <span className="break-all font-mono">
                          {details.roleArn}
                        </span>
                      }
                    />
                    <DetailRow
                      label="Role ID"
                      value={
                        <span className="font-mono">{details.id ?? "-"}</span>
                      }
                    />
                    <DetailRow label="Path" value={details.path ?? "-"} />
                    <DetailRow
                      label="Description"
                      value={details.description ?? "-"}
                    />
                    <DetailRow
                      label="Created"
                      value={details.createdAt ?? "-"}
                    />
                    <DetailRow
                      label="Maximum session duration"
                      value={formatSessionDuration(details.maxSessionDuration)}
                    />
                  </div>

                  <section className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium">Role tags</h3>
                        <p className="text-xs text-muted-foreground">
                          Metadata used by RGW policy conditions and session tag
                          matching. Each key must be unique.
                        </p>
                      </div>
                      {canEditTags ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            pendingAction !== null || tagDrafts.length >= 50
                          }
                          onClick={() =>
                            setTagDrafts((current) => [
                              ...current,
                              { key: "", value: "" },
                            ])
                          }
                        >
                          <Plus />
                          Add tag
                        </Button>
                      ) : null}
                    </div>

                    {!details.tagsAvailable ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Role tags are unavailable.
                      </div>
                    ) : canEditTags && scope ? (
                      <>
                        {tagDrafts.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                            No role tags configured.
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-md border">
                            {tagDrafts.map((tag, index) => (
                              <div
                                key={index}
                                className="grid gap-2 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                              >
                                <div className="space-y-1.5">
                                  <Label htmlFor={`role-tag-key-${index}`}>
                                    Key
                                  </Label>
                                  <Input
                                    id={`role-tag-key-${index}`}
                                    value={tag.key}
                                    autoComplete="off"
                                    disabled={pendingAction !== null}
                                    onChange={(event) =>
                                      setTagDrafts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                key: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`role-tag-value-${index}`}>
                                    Value
                                  </Label>
                                  <Input
                                    id={`role-tag-value-${index}`}
                                    value={tag.value}
                                    autoComplete="off"
                                    disabled={pendingAction !== null}
                                    onChange={(event) =>
                                      setTagDrafts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                value: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  className="self-end text-destructive hover:text-destructive"
                                  title="Remove tag"
                                  disabled={pendingAction !== null}
                                  onClick={() =>
                                    setTagDrafts((current) =>
                                      current.filter(
                                        (_, itemIndex) => itemIndex !== index,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 />
                                  <span className="sr-only">Remove tag</span>
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {tagError ? (
                          <MutationAlert>{tagError}</MutationAlert>
                        ) : null}
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={
                              pendingAction !== null || Boolean(tagError)
                            }
                            onClick={() =>
                              void runMutation("tags", () =>
                                updateIamRoleTags(
                                  scope,
                                  details.roleName,
                                  tagDrafts,
                                ),
                              )
                            }
                          >
                            {pendingAction === "tags" ? <Spinner /> : <Save />}
                            Save tags
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {details.tags.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                            No role tags configured.
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-md border">
                            {details.tags.map((tag, index) => (
                              <DetailRow
                                key={`${tag.key}:${tag.value}:${index}`}
                                label={tag.key}
                                value={tag.value}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  {canMutate && scope ? (
                    <section className="space-y-2 rounded-md border p-3">
                      <div>
                        <h3 className="text-sm font-medium">
                          Maximum session duration
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Upper bound for credentials issued when this role is
                          assumed.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={durationDraft}
                          onValueChange={setDurationDraft}
                          disabled={pendingAction !== null}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3600">1 hour</SelectItem>
                            <SelectItem value="7200">2 hours</SelectItem>
                            <SelectItem value="14400">4 hours</SelectItem>
                            <SelectItem value="28800">8 hours</SelectItem>
                            <SelectItem value="43200">12 hours</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() =>
                            void runMutation("duration", () =>
                              updateIamRoleSessionDuration(
                                scope,
                                details.roleName,
                                Number(durationDraft),
                              ),
                            )
                          }
                        >
                          {pendingAction === "duration" ? (
                            <Spinner />
                          ) : (
                            <Save />
                          )}
                          Save duration
                        </Button>
                      </div>
                    </section>
                  ) : null}
                </TabsContent>

                <TabsContent value="trust-policy" className="space-y-3">
                  {details.assumeRolePolicy ? (
                    <>
                      <JsonEditor
                        label="Assume role policy JSON"
                        value={trustDraft}
                        onChange={setTrustDraft}
                        errors={
                          trustValidation.ok ? [] : trustValidation.errors
                        }
                        readOnly={!canMutate}
                        height="400px"
                      />
                      {canMutate && scope ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={
                              pendingAction !== null || !trustValidation.ok
                            }
                            onClick={() =>
                              void runMutation("trust-policy", () =>
                                updateIamRoleTrustPolicy(
                                  scope,
                                  details.roleName,
                                  trustDraft,
                                ),
                              )
                            }
                          >
                            {pendingAction === "trust-policy" ? (
                              <Spinner />
                            ) : (
                              <Save />
                            )}
                            Save trust policy
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      Assume role policy is unavailable.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="permissions" className="space-y-5">
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Inline policies</h3>
                      <p className="text-xs text-muted-foreground">
                        Permission documents stored directly on this role.
                      </p>
                    </div>

                    {!details.inlinePoliciesAvailable ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Inline role policy list is unavailable.
                      </div>
                    ) : details.inlinePolicies.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        No inline role policies.
                      </div>
                    ) : (
                      details.inlinePolicies.map((policy) => {
                        const draft = inlineDrafts[policy.name] ?? "";
                        const validation =
                          validateIamPermissionPolicyJson(draft);
                        return (
                          <div
                            key={policy.name}
                            className="space-y-3 rounded-md border p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="break-all font-mono text-sm font-medium">
                                {policy.name}
                              </div>
                              {canMutate && scope ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                      pendingAction !== null || !validation.ok
                                    }
                                    onClick={() =>
                                      void runMutation(
                                        `inline:${policy.name}`,
                                        () =>
                                          putIamInlineRolePolicy(
                                            scope,
                                            details.roleName,
                                            policy.name,
                                            draft,
                                          ),
                                      )
                                    }
                                  >
                                    {pendingAction ===
                                    `inline:${policy.name}` ? (
                                      <Spinner />
                                    ) : (
                                      <Save />
                                    )}
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    disabled={pendingAction !== null}
                                    onClick={() =>
                                      setDeletePolicyName(policy.name)
                                    }
                                  >
                                    <Trash2 />
                                    Delete
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                            {policy.document ? (
                              <JsonEditor
                                label={`${policy.name} policy JSON`}
                                value={draft}
                                onChange={(value) =>
                                  setInlineDrafts((current) => ({
                                    ...current,
                                    [policy.name]: value,
                                  }))
                                }
                                errors={validation.ok ? [] : validation.errors}
                                readOnly={!canMutate}
                                height="260px"
                              />
                            ) : (
                              <MutationAlert>
                                {policy.error ??
                                  "Policy document is unavailable."}
                              </MutationAlert>
                            )}
                          </div>
                        );
                      })
                    )}

                    {canMutate && scope ? (
                      <div className="space-y-3 rounded-md border border-dashed p-3">
                        <div className="flex items-center gap-2">
                          <Plus className="size-4" />
                          <h4 className="text-sm font-medium">
                            Add inline policy
                          </h4>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="new-inline-policy-name">
                            Policy name
                          </Label>
                          <Input
                            id="new-inline-policy-name"
                            value={newPolicyName}
                            onChange={(event) =>
                              setNewPolicyName(event.target.value)
                            }
                            placeholder="ListApplicationBuckets"
                            autoComplete="off"
                          />
                        </div>
                        <JsonEditor
                          label="New inline policy JSON"
                          value={newPolicyDocument}
                          onChange={setNewPolicyDocument}
                          errors={
                            newPolicyValidation.ok
                              ? []
                              : newPolicyValidation.errors
                          }
                          height="280px"
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={
                              pendingAction !== null ||
                              !!validateIamPolicyName(newPolicyName.trim()) ||
                              !newPolicyValidation.ok
                            }
                            onClick={() =>
                              void runMutation("new-inline-policy", () =>
                                putIamInlineRolePolicy(
                                  scope,
                                  details.roleName,
                                  newPolicyName,
                                  newPolicyDocument,
                                ),
                              ).then((saved) => {
                                if (!saved) return;
                                setNewPolicyName("");
                                setNewPolicyDocument(
                                  defaultIamPermissionPolicy(),
                                );
                              })
                            }
                          >
                            {pendingAction === "new-inline-policy" ? (
                              <Spinner />
                            ) : (
                              <Plus />
                            )}
                            Add inline policy
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="space-y-3 border-t pt-5">
                    <div>
                      <h3 className="text-sm font-medium">Managed policies</h3>
                      <p className="text-xs text-muted-foreground">
                        Ceph RGW provides six built-in managed policies. AWS
                        customer-managed policy APIs are not available in RGW.
                      </p>
                    </div>

                    {!details.attachedPoliciesAvailable ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Attached role policy list is unavailable.
                      </div>
                    ) : details.attachedPolicies.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        No managed policies attached.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-md border">
                        {details.attachedPolicies.map((policy) => (
                          <div
                            key={policy.arn}
                            className="flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <div className="break-all font-mono text-sm font-medium">
                                {policy.name}
                              </div>
                              <div className="break-all font-mono text-xs text-muted-foreground">
                                {policy.arn}
                              </div>
                            </div>
                            {canMutate &&
                            scope &&
                            isSupportedRgwManagedPolicy(policy.arn) ? (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={pendingAction !== null}
                                onClick={() =>
                                  void runMutation(`detach:${policy.arn}`, () =>
                                    detachIamManagedRolePolicy(
                                      scope,
                                      details.roleName,
                                      policy.arn,
                                    ),
                                  )
                                }
                              >
                                {pendingAction === `detach:${policy.arn}` ? (
                                  <Spinner />
                                ) : (
                                  <Unlink />
                                )}
                                Detach
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {canMutate && scope ? (
                      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
                        <div className="min-w-64 flex-1 space-y-1.5">
                          <Label>Attach a Ceph managed policy</Label>
                          <Select
                            value={attachPolicyArn}
                            onValueChange={setAttachPolicyArn}
                            disabled={
                              pendingAction !== null ||
                              availableManagedPolicies.length === 0
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  availableManagedPolicies.length === 0
                                    ? "All supported policies are attached"
                                    : "Select policy"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {availableManagedPolicies.map((policy) => (
                                <SelectItem key={policy.arn} value={policy.arn}>
                                  {policy.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          disabled={pendingAction !== null || !attachPolicyArn}
                          onClick={() =>
                            void runMutation("attach-policy", () =>
                              attachIamManagedRolePolicy(
                                scope,
                                details.roleName,
                                attachPolicyArn,
                              ),
                            ).then((attached) => {
                              if (attached) setAttachPolicyArn("");
                            })
                          }
                        >
                          {pendingAction === "attach-policy" ? (
                            <Spinner />
                          ) : (
                            <Link2 />
                          )}
                          Attach policy
                        </Button>
                      </div>
                    ) : null}
                  </section>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        ) : null}
      </DialogContent>

      <MutationConfirmationDialog
        open={deletePolicyName !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletePolicyName(null);
        }}
        onConfirm={async () => {
          if (!scope || !details || !deletePolicyName) return;
          const deleted = await runMutation("delete-inline-policy", () =>
            deleteIamInlineRolePolicy(
              scope,
              details.roleName,
              deletePolicyName,
            ),
          );
          if (deleted) setDeletePolicyName(null);
        }}
        pending={pendingAction === "delete-inline-policy"}
        title="Delete inline policy?"
        description={`Delete ${deletePolicyName ?? "this inline policy"} from ${details?.roleName ?? "this role"}? This cannot be undone.`}
        confirmLabel="Delete policy"
        pendingLabel="Deleting policy"
        variant="destructive"
      />
    </Dialog>
  );
}
