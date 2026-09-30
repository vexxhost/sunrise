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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

  const reset = () => {
    setType("key");
    setName("");
    setAlgorithm("aes");
    setBitLength("256");
    setMode("cbc");
    setExpiration("");
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
    if (pending || !validation.success) return;
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
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Generate key material</SheetTitle>
          <SheetDescription>
            Submit a Barbican order. Symmetric orders create a secret;
            asymmetric orders create a key-pair container.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
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
            Barbican will generate <strong>{algorithm || "-"}</strong> material
            at <strong>{bitLength || "-"} bits</strong>. Sunrise never receives
            the generated payload in this workflow.
          </div>
          {error ? <MutationAlert>{error}</MutationAlert> : null}
        </div>
        <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !validation.success}
            title={
              validation.success
                ? undefined
                : validation.error.issues[0]?.message
            }
            onClick={create}
          >
            {pending ? <Spinner /> : null}
            {pending ? "Submitting" : "Submit order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
