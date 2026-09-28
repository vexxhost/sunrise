"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, ShieldPlus, Trash2 } from "lucide-react";
import { JsonEditor } from "@/components/JsonEditor";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { validateIamTrustPolicyJson } from "@/lib/json-document";
import type { MutationScope } from "@/lib/mutations";
import { startObjectStorageCredentialRefresh } from "@/lib/s3/auth-navigation";
import {
  createIamRole,
  type CreateIamRoleInput,
  type IamRoleTag,
} from "@/lib/s3/role-actions";
import {
  defaultIamTrustPolicy,
  validateIamRoleDescription,
  validateIamRoleName,
  validateIamRolePath,
  validateIamRoleTags,
  validateIamSessionDuration,
} from "@/lib/s3/role-policy";

const steps = ["details", "trust", "tags", "review"] as const;
type Step = (typeof steps)[number];

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value}</div>
    </div>
  );
}

export function IamRoleCreateSheet({
  activeRoleArn,
  onCreated,
  onOpenChange,
  open,
  scope,
}: {
  activeRoleArn: string;
  onCreated: (message: string) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: MutationScope;
}) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [path, setPath] = useState("/");
  const [description, setDescription] = useState("");
  const [maxSessionDuration, setMaxSessionDuration] = useState(3600);
  const [trustPolicy, setTrustPolicy] = useState(() =>
    defaultIamTrustPolicy(activeRoleArn),
  );
  const [tags, setTags] = useState<IamRoleTag[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleNameError = name.trim() ? validateIamRoleName(name.trim()) : null;
  const pathError = validateIamRolePath(path.trim());
  const descriptionError = validateIamRoleDescription(description.trim());
  const durationError = validateIamSessionDuration(maxSessionDuration);
  const tagError = validateIamRoleTags(
    tags.map((tag) => ({ key: tag.key.trim(), value: tag.value.trim() })),
  );
  const trustValidation = validateIamTrustPolicyJson(trustPolicy);
  const validationError =
    validateIamRoleName(name.trim()) ??
    pathError ??
    descriptionError ??
    durationError ??
    tagError ??
    (trustValidation.ok ? null : trustValidation.errors.join(" "));
  const stepIndex = steps.indexOf(step);

  const reset = () => {
    setStep("details");
    setName("");
    setPath("/");
    setDescription("");
    setMaxSessionDuration(3600);
    setTrustPolicy(defaultIamTrustPolicy(activeRoleArn));
    setTags([]);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleCreate = async () => {
    if (pending || validationError) return;
    setPending(true);
    setError(null);
    const input: CreateIamRoleInput = {
      name,
      path,
      description,
      maxSessionDuration,
      assumeRolePolicy: trustPolicy,
      tags,
    };
    const result = await createIamRole(scope, input);
    setPending(false);
    if (!result.ok) {
      if (result.error.code === "authentication-required") {
        startObjectStorageCredentialRefresh();
        return;
      }
      setError(result.error.message);
      return;
    }
    await onCreated(result.message);
    handleOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-4xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Create IAM role</SheetTitle>
          <SheetDescription>
            Create an assumable role in the active RGW account. Permissions are
            added after the role is created.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={step}
          onValueChange={(value) => setStep(value as Step)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-5 py-3">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="trust">Trust policy</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="details" className="mt-0 space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="iam-role-name">Role name</Label>
                  <Input
                    id="iam-role-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="ApplicationReadOnly"
                    autoComplete="off"
                    aria-invalid={roleNameError ? true : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    Up to 64 characters using letters, numbers, or _+=,.@-.
                  </p>
                  {roleNameError ? (
                    <p className="text-xs text-destructive">{roleNameError}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="iam-role-path">Path</Label>
                  <Input
                    id="iam-role-path"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="/applications/"
                    autoComplete="off"
                    aria-invalid={pathError ? true : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    Organizes the role ARN. Paths start and end with a slash.
                  </p>
                  {pathError ? (
                    <p className="text-xs text-destructive">{pathError}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="iam-role-description">Description</Label>
                <Textarea
                  id="iam-role-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="How this role is intended to be used"
                  className="min-h-24"
                  aria-invalid={descriptionError ? true : undefined}
                />
                {descriptionError ? (
                  <p className="text-xs text-destructive">{descriptionError}</p>
                ) : null}
              </div>

              <div className="max-w-sm space-y-1.5">
                <Label>Maximum session duration</Label>
                <Select
                  value={String(maxSessionDuration)}
                  onValueChange={(value) =>
                    setMaxSessionDuration(Number(value))
                  }
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">
                  The upper bound for credentials issued when this role is
                  assumed.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="trust" className="mt-0 space-y-3">
              <div>
                <h3 className="font-medium">Assume role policy</h3>
                <p className="text-sm text-muted-foreground">
                  Defines which identities may assume this role. The initial
                  policy trusts the current Sunrise access role.
                </p>
              </div>
              <JsonEditor
                label="Assume role policy JSON"
                value={trustPolicy}
                onChange={setTrustPolicy}
                errors={trustValidation.ok ? [] : trustValidation.errors}
                height="430px"
              />
            </TabsContent>

            <TabsContent value="tags" className="mt-0 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">Role tags</h3>
                  <p className="text-sm text-muted-foreground">
                    Optional metadata used by RGW policy conditions and session
                    tag matching. Each key must be unique.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setTags((current) => [...current, { key: "", value: "" }])
                  }
                  disabled={tags.length >= 50}
                >
                  <Plus className="size-4" />
                  Add tag
                </Button>
              </div>

              {tags.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No role tags configured.
                </div>
              ) : (
                <div className="space-y-3">
                  {tags.map((tag, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`iam-tag-key-${index}`}>Key</Label>
                        <Input
                          id={`iam-tag-key-${index}`}
                          value={tag.key}
                          onChange={(event) =>
                            setTags((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, key: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`iam-tag-value-${index}`}>Value</Label>
                        <Input
                          id={`iam-tag-value-${index}`}
                          value={tag.value}
                          onChange={(event) =>
                            setTags((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="self-end text-destructive hover:text-destructive"
                        title="Remove tag"
                        onClick={() =>
                          setTags((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Remove tag</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {tagError ? <MutationAlert>{tagError}</MutationAlert> : null}
            </TabsContent>

            <TabsContent value="review" className="mt-0 space-y-4">
              <div>
                <h3 className="font-medium">Review role</h3>
                <p className="text-sm text-muted-foreground">
                  Confirm the role identity and trust boundary. Add inline or
                  managed permissions from the role details after creation.
                </p>
              </div>
              <div className="overflow-hidden rounded-md border">
                <ReviewRow label="Name" value={name.trim() || "-"} />
                <ReviewRow label="Path" value={path.trim() || "-"} />
                <ReviewRow
                  label="Description"
                  value={description.trim() || "-"}
                />
                <ReviewRow
                  label="Maximum session"
                  value={`${maxSessionDuration / 3600} ${maxSessionDuration === 3600 ? "hour" : "hours"}`}
                />
                <ReviewRow
                  label="Tags"
                  value={tags.length === 0 ? "None" : String(tags.length)}
                />
              </div>
              <JsonEditor
                label="Reviewed assume role policy JSON"
                value={trustPolicy}
                onChange={setTrustPolicy}
                errors={trustValidation.ok ? [] : trustValidation.errors}
                height="300px"
              />
              {validationError ? (
                <MutationAlert title="Role is not ready">
                  {validationError}
                </MutationAlert>
              ) : null}
              {error ? <MutationAlert>{error}</MutationAlert> : null}
            </TabsContent>
          </div>
        </Tabs>

        <SheetFooter className="flex-row items-center justify-between border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setStep(steps[stepIndex - 1])}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : null}
            {step !== "review" ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => setStep(steps[stepIndex + 1])}
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending || !!validationError}
                onClick={() => void handleCreate()}
              >
                {pending ? <Spinner /> : <ShieldPlus className="size-4" />}
                {pending ? "Creating role" : "Create role"}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
