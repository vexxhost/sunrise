"use client";

import { useMemo, useState } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import { createOrderAction } from "@/lib/openstack/barbican-actions";
import { createOrderSchema } from "@/lib/openstack/barbican-input";
import type { MutationScope } from "@/lib/mutations";

export function OrderCreateSheet({
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
  const [type, setType] = useState<"key" | "asymmetric">("key");
  const [activeTab, setActiveTab] = useState("details");
  const [name, setName] = useState("");
  const [algorithm, setAlgorithm] = useState("aes");
  const [bitLength, setBitLength] = useState("256");
  const [mode, setMode] = useState("cbc");
  const [expiration, setExpiration] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useMemo(
    () => ({
      type,
      name,
      algorithm,
      bitLength: Number(bitLength),
      mode: mode || undefined,
      expiration: expiration ? new Date(expiration).toISOString() : undefined,
    }),
    [algorithm, bitLength, expiration, mode, name, type],
  );
  const validation = createOrderSchema.safeParse(input);
  const reviewIssues = validation.success
    ? []
    : Array.from(
        new Set(
          validation.error.issues.map((issue) => {
            switch (issue.path[0]) {
              case "name":
                return "Enter a generated resource name.";
              case "algorithm":
                return "Enter a key algorithm.";
              case "bitLength":
                return "Enter a positive whole-number bit length.";
              default:
                return issue.message;
            }
          }),
        ),
      );

  const reset = () => {
    setType("key");
    setName("");
    setAlgorithm("aes");
    setBitLength("256");
    setMode("cbc");
    setExpiration("");
    setActiveTab("details");
    setError(null);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };
  const changeType = (nextType: "key" | "asymmetric") => {
    setType(nextType);
    if (nextType === "key") {
      setAlgorithm("aes");
      setBitLength("256");
      setMode("cbc");
    } else {
      setAlgorithm("rsa");
      setBitLength("2048");
      setMode("");
    }
  };
  const create = async () => {
    if (pending || activeTab !== "review" || !validation.success) return;
    setPending(true);
    setError(null);
    const result = await createOrderAction(scope, validation.data);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onCreated(result.message);
    changeOpen(false);
  };

  return (
    <WizardDialog open={open} onOpenChange={changeOpen}>
      <WizardDialogContent className="sm:max-w-2xl">
        <WizardDialogHeader>
          <WizardDialogTitle>Generate key material</WizardDialogTitle>
          <WizardDialogDescription>
            Submit a Barbican order. Symmetric orders create a secret;
            asymmetric orders create a key-pair container.
          </WizardDialogDescription>
        </WizardDialogHeader>
        <Tabs
          className="flex min-h-0 flex-1 flex-col px-5 pt-4"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto pb-5">
            <TabsContent className="space-y-5 pt-3" value="details">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Order type</Label>
                  <Select
                    value={type}
                    onValueChange={(value) =>
                      changeType(value as "key" | "asymmetric")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="key">Symmetric key</SelectItem>
                      <SelectItem value="asymmetric">
                        Asymmetric key pair
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-order-name">
                    Generated resource name
                  </Label>
                  <Input
                    id="barbican-order-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="service-encryption-key"
                  />
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-order-algorithm">Algorithm</Label>
                  <Input
                    id="barbican-order-algorithm"
                    value={algorithm}
                    onChange={(event) => setAlgorithm(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-order-bits">Bit length</Label>
                  <Input
                    id="barbican-order-bits"
                    type="number"
                    min={1}
                    value={bitLength}
                    onChange={(event) => setBitLength(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barbican-order-mode">Mode</Label>
                  <Input
                    id="barbican-order-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    disabled={type === "asymmetric"}
                    placeholder={type === "key" ? "cbc" : "Not used"}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="barbican-order-expiration">Expiration</Label>
                <Input
                  id="barbican-order-expiration"
                  type="datetime-local"
                  value={expiration}
                  onChange={(event) => setExpiration(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Optional expiration for generated secret material.
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm">
                Barbican will generate <strong>{algorithm || "-"}</strong>{" "}
                material at <strong>{bitLength || "-"} bits</strong>. Sunrise
                never receives the generated payload in this workflow.
              </div>
            </TabsContent>
            <TabsContent className="space-y-5 pt-3" value="review">
              <WizardReviewStatus issues={reviewIssues} />
              <div>
                <h3 className="text-sm font-semibold">Review order</h3>
                <p className="text-xs text-muted-foreground">
                  Barbican generates the key material after this order is
                  submitted. Sunrise never receives the generated payload here.
                </p>
              </div>
              <dl className="rounded-md border px-4">
                <WizardReviewRow
                  label="Order type"
                  value={
                    type === "key" ? "Symmetric key" : "Asymmetric key pair"
                  }
                />
                <WizardReviewRow label="Resource name" value={name || "-"} />
                <WizardReviewRow label="Algorithm" value={algorithm || "-"} />
                <WizardReviewRow label="Bit length" value={bitLength || "-"} />
                <WizardReviewRow
                  label="Mode"
                  value={mode || "Not applicable"}
                />
                <WizardReviewRow
                  label="Expiration"
                  value={
                    expiration
                      ? new Date(expiration).toLocaleString()
                      : "No expiration"
                  }
                />
              </dl>
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
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          {activeTab === "review" ? (
            <Button
              type="button"
              disabled={pending || reviewIssues.length > 0}
              onClick={create}
            >
              {pending ? <Spinner /> : null}
              {pending ? "Creating" : "Create key order"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={() => setActiveTab("review")}
            >
              Review key order
            </Button>
          )}
        </WizardDialogFooter>
      </WizardDialogContent>
    </WizardDialog>
  );
}
