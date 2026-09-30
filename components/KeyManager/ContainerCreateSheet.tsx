"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { SecretPicker } from "@/components/KeyManager/SecretPicker";
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
import { createContainerAction } from "@/lib/openstack/barbican-actions";
import { createContainerSchema } from "@/lib/openstack/barbican-input";
import type { MutationScope } from "@/lib/mutations";
import type { BarbicanSecret } from "@/types/openstack";

type ContainerType = "generic" | "rsa" | "certificate";
type SecretSelection = { name: string; secretId: string };

const typedSlots: Record<Exclude<ContainerType, "generic">, string[]> = {
  rsa: ["public_key", "private_key", "private_key_passphrase"],
  certificate: [
    "certificate",
    "private_key",
    "private_key_passphrase",
    "intermediates",
  ],
};

export function ContainerCreateSheet({
  onCreated,
  onOpenChange,
  open,
  scope,
  secrets,
}: {
  onCreated: (message: string) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: MutationScope;
  secrets: BarbicanSecret[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ContainerType>("generic");
  const [refs, setRefs] = useState<SecretSelection[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secretById = useMemo(
    () => new Map(secrets.map((secret) => [secret.id, secret])),
    [secrets],
  );
  const input = {
    name,
    type,
    secretRefs: refs
      .filter(({ secretId }) => secretId)
      .map(({ name: refName, secretId }) => ({
        name: refName || undefined,
        secretRef: secretById.get(secretId)?.secret_ref ?? "",
      })),
  };
  const validation = createContainerSchema.safeParse(input);
  const requiredMissing =
    type === "rsa"
      ? ["public_key", "private_key"].some(
          (slot) => !refs.find((ref) => ref.name === slot)?.secretId,
        )
      : type === "certificate"
        ? !refs.find((ref) => ref.name === "certificate")?.secretId
        : false;

  const reset = () => {
    setName("");
    setType("generic");
    setRefs([]);
    setError(null);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };
  const changeType = (nextType: ContainerType) => {
    setType(nextType);
    setRefs(
      nextType === "generic"
        ? []
        : typedSlots[nextType].map((slot) => ({ name: slot, secretId: "" })),
    );
  };
  const updateRef = (index: number, update: Partial<SecretSelection>) => {
    setRefs((current) =>
      current.map((ref, refIndex) =>
        refIndex === index ? { ...ref, ...update } : ref,
      ),
    );
  };
  const create = async () => {
    if (pending || !validation.success || requiredMissing) return;
    setPending(true);
    setError(null);
    const result = await createContainerAction(scope, validation.data);
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
      <SheetContent className="w-full gap-0 max-sm:!w-full max-sm:!max-w-none sm:max-w-3xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Create secret container</SheetTitle>
          <SheetDescription>
            Group existing Barbican secrets without copying their payloads.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="barbican-container-name">Name</Label>
              <Input
                id="barbican-container-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="tls-material"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Container type</Label>
              <Select
                value={type}
                onValueChange={(value) => changeType(value as ContainerType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generic">Generic</SelectItem>
                  <SelectItem value="rsa">RSA key pair</SelectItem>
                  <SelectItem value="certificate">
                    Certificate bundle
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Secret references</h3>
                <p className="text-xs text-muted-foreground">
                  {type === "generic"
                    ? "Add any number of uniquely named secrets."
                    : "Required names follow Barbican's typed-container contract."}
                </p>
              </div>
              {type === "generic" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRefs((current) => [
                      ...current,
                      { name: "", secretId: "" },
                    ])
                  }
                >
                  <Plus className="size-4" />
                  Add reference
                </Button>
              ) : null}
            </div>
            {refs.length ? (
              <div className="divide-y rounded-md border">
                {refs.map((ref, index) => (
                  <div
                    key={`${ref.name}:${index}`}
                    className="grid gap-3 p-3 md:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)_auto] md:items-end"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`container-ref-name-${index}`}>
                        Reference name
                      </Label>
                      <Input
                        id={`container-ref-name-${index}`}
                        value={ref.name}
                        disabled={type !== "generic"}
                        onChange={(event) =>
                          updateRef(index, { name: event.target.value })
                        }
                        placeholder="private_key"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`container-ref-secret-${index}`}>
                        Secret
                      </Label>
                      <SecretPicker
                        disabledIds={refs
                          .filter(
                            (_, candidateIndex) => candidateIndex !== index,
                          )
                          .map(({ secretId }) => secretId)
                          .filter(Boolean)}
                        id={`container-ref-secret-${index}`}
                        onValueChange={(secretId) =>
                          updateRef(index, { secretId })
                        }
                        secrets={secrets}
                        value={ref.secretId}
                      />
                    </div>
                    {type === "generic" ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Remove reference"
                        onClick={() =>
                          setRefs((current) =>
                            current.filter((_, refIndex) => refIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Remove reference</span>
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No secret references selected.
              </div>
            )}
          </div>
          {requiredMissing ? (
            <MutationAlert variant="warning">
              Select every required secret before creating this typed container.
            </MutationAlert>
          ) : null}
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
            disabled={pending || !validation.success || requiredMissing}
            onClick={create}
          >
            {pending ? <Spinner /> : null}
            {pending ? "Creating" : "Create container"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
