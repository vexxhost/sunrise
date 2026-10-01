"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
import { createSecretSchema } from "@/lib/openstack/barbican-input";
import type { MutationScope } from "@/lib/mutations";

const steps = ["details", "payload", "advanced", "review"] as const;
type Step = (typeof steps)[number];

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value}</div>
    </div>
  );
}

export function SecretCreateSheet({
  onCreated,
  onOpenChange,
  open,
  scope,
}: {
  onCreated: (message: string) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: MutationScope;
}) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [secretType, setSecretType] = useState("opaque");
  const [payload, setPayload] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  const [payloadEncoding, setPayloadEncoding] = useState<"plain" | "base64">(
    "plain",
  );
  const [contentType, setContentType] = useState("text/plain");
  const [expiration, setExpiration] = useState("");
  const [algorithm, setAlgorithm] = useState("");
  const [bitLength, setBitLength] = useState("");
  const [mode, setMode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo(
    () => ({
      name,
      secretType,
      payload: payload || undefined,
      payloadEncoding,
      contentType,
      expiration: expiration ? new Date(expiration).toISOString() : undefined,
      algorithm: algorithm || undefined,
      bitLength: bitLength ? Number(bitLength) : undefined,
      mode: mode || undefined,
    }),
    [
      algorithm,
      bitLength,
      contentType,
      expiration,
      mode,
      name,
      payload,
      payloadEncoding,
      secretType,
    ],
  );
  const validation = createSecretSchema.safeParse(input);
  const validationError = validation.success
    ? null
    : (validation.error.issues[0]?.message ?? "Review the secret details.");
  const reviewIssues = validation.success
    ? []
    : Array.from(
        new Set(
          validation.error.issues.map((issue) => {
            switch (issue.path[0]) {
              case "name":
                return "Enter a secret name.";
              case "contentType":
                return "Enter a content type.";
              default:
                return issue.message;
            }
          }),
        ),
      );

  const reset = () => {
    setStep("details");
    setName("");
    setSecretType("opaque");
    setPayload("");
    setShowPayload(false);
    setPayloadEncoding("plain");
    setContentType("text/plain");
    setExpiration("");
    setAlgorithm("");
    setBitLength("");
    setMode("");
    setError(null);
  };

  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const create = async () => {
    if (pending || step !== "review" || !validation.success) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/key-manager/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ scope, input: validation.data }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: { message?: string } | string;
      };
      if (!response.ok || !result.ok) {
        const message =
          typeof result.error === "string"
            ? result.error
            : result.error?.message;
        setError(message ?? "The secret could not be created.");
        return;
      }
      await onCreated(result.message ?? `Secret ${name} was created.`);
      changeOpen(false);
    } catch {
      setError("Key Manager could not be reached. Try again shortly.");
    } finally {
      setPending(false);
    }
  };

  return (
    <WizardDialog open={open} onOpenChange={changeOpen}>
      <WizardDialogContent>
        <WizardDialogHeader>
          <WizardDialogTitle>Create secret</WizardDialogTitle>
          <WizardDialogDescription>
            Store protected material in Barbican. Payload values are sent
            directly through a dedicated API route and are never retained by
            Sunrise.
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
              <TabsTrigger value="payload">Payload</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="details" className="mt-0 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="barbican-secret-name">Name</Label>
                <Input
                  id="barbican-secret-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="database-password"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Secret type</Label>
                <Select value={secretType} onValueChange={setSecretType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ["opaque", "Opaque value"],
                      ["symmetric", "Symmetric key"],
                      ["public", "Public key"],
                      ["private", "Private key"],
                      ["passphrase", "Passphrase"],
                      ["certificate", "Certificate"],
                    ].map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="barbican-secret-expiration">Expiration</Label>
                <Input
                  id="barbican-secret-expiration"
                  type="datetime-local"
                  value={expiration}
                  onChange={(event) => setExpiration(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. The secret cannot be retrieved after this time.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="payload" className="mt-0 space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Encoding</Label>
                  <Select
                    value={payloadEncoding}
                    onValueChange={(value) =>
                      setPayloadEncoding(value as "plain" | "base64")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plain">Plain text</SelectItem>
                      <SelectItem value="base64">Base64</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-secret-content-type">
                    Content type
                  </Label>
                  <Input
                    id="barbican-secret-content-type"
                    value={contentType}
                    onChange={(event) => setContentType(event.target.value)}
                    placeholder="text/plain"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="barbican-secret-payload">Payload</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPayload((current) => !current)}
                  >
                    {showPayload ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {showPayload ? "Hide" : "Show"}
                  </Button>
                </div>
                {showPayload ? (
                  <Textarea
                    id="barbican-secret-payload"
                    className="min-h-28 font-mono"
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    autoComplete="new-password"
                  />
                ) : (
                  <Input
                    id="barbican-secret-payload"
                    className="h-28 font-mono"
                    type="password"
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    autoComplete="new-password"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Leave blank to create metadata now and upload the payload
                  later.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="advanced" className="mt-0 space-y-5">
              <div className="grid gap-5 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-secret-algorithm">Algorithm</Label>
                  <Input
                    id="barbican-secret-algorithm"
                    value={algorithm}
                    onChange={(event) => setAlgorithm(event.target.value)}
                    placeholder="aes"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-secret-bits">Bit length</Label>
                  <Input
                    id="barbican-secret-bits"
                    type="number"
                    min={1}
                    value={bitLength}
                    onChange={(event) => setBitLength(event.target.value)}
                    placeholder="256"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-secret-mode">Mode</Label>
                  <Input
                    id="barbican-secret-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    placeholder="cbc"
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                These fields describe the payload for clients. Barbican does not
                validate supplied key material against them.
              </p>
            </TabsContent>
            <TabsContent value="review" className="mt-0 space-y-4">
              <WizardReviewStatus issues={reviewIssues} />
              <div className="overflow-hidden rounded-md border">
                <ReviewRow label="Name" value={name || "-"} />
                <ReviewRow label="Type" value={secretType} />
                <ReviewRow
                  label="Payload"
                  value={
                    payload
                      ? `${payloadEncoding}, ${contentType}`
                      : "Not supplied"
                  }
                />
                <ReviewRow
                  label="Expiration"
                  value={
                    expiration ? new Date(expiration).toLocaleString() : "Never"
                  }
                />
                <ReviewRow
                  label="Cryptographic metadata"
                  value={
                    [algorithm, bitLength && `${bitLength} bits`, mode]
                      .filter(Boolean)
                      .join(" · ") || "Not set"
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">
                After creation, a payload can be viewed on demand or downloaded.
                Metadata-only secrets accept payload data once.
              </p>
              {error ? <MutationAlert>{error}</MutationAlert> : null}
            </TabsContent>
          </div>
        </Tabs>
        <WizardDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          {step === "review" ? (
            <Button
              type="button"
              disabled={pending || reviewIssues.length > 0}
              title={validationError ?? undefined}
              onClick={create}
            >
              {pending ? <Spinner /> : null}
              {pending ? "Creating" : "Create secret"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={() => setStep("review")}
            >
              Review secret
            </Button>
          )}
        </WizardDialogFooter>
      </WizardDialogContent>
    </WizardDialog>
  );
}
