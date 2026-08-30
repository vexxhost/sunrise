"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, KeyRound, Plus } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createKeypairAction } from "@/lib/openstack/nova-actions";

interface KeypairActionsProps {
  projectId?: string;
  regionId?: string;
}

export function KeypairActions({ projectId, regionId }: KeypairActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"generate" | "import">("generate");
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setMode("generate");
    setName("");
    setPublicKey("");
    setPrivateKey(null);
    setError(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) reset();
    setOpen(nextOpen);
  };

  const submit = () => {
    if (!projectId || !regionId) return;
    startTransition(async () => {
      setError(null);
      const result = await createKeypairAction(
        { projectId, regionId },
        {
          name,
          publicKey: mode === "import" ? publicKey : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "keypairs"],
      });
      if (mode === "generate") {
        if (!result.data.private_key) {
          setError("Nova created the key pair but did not return private key material.");
          return;
        }
        setPrivateKey(result.data.private_key);
        return;
      }

      setOpen(false);
      reset();
    });
  };

  const downloadPrivateKey = () => {
    if (!privateKey) return;
    const url = URL.createObjectURL(
      new Blob([privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`], {
        type: "application/x-pem-file",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.pem`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button
        className="h-10 gap-2"
        disabled={!projectId || !regionId}
        onClick={() => handleOpenChange(true)}
      >
        <Plus className="size-4" />
        Add key pair
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              Add key pair
            </DialogTitle>
            <DialogDescription>
              Generate a new SSH key or import an existing public key.
            </DialogDescription>
          </DialogHeader>

          {privateKey ? (
            <div className="space-y-4">
              <MutationAlert variant="warning" title="Save this private key now">
                Nova will not return the private key again. Store it securely before
                closing this dialog.
              </MutationAlert>
              <Textarea
                className="min-h-52 font-mono text-xs"
                readOnly
                value={privateKey}
                aria-label="Generated private key"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={downloadPrivateKey}>
                  <Download className="size-4" />
                  Download {name}.pem
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(privateKey);
                    setCopied(true);
                  }}
                >
                  <Copy className="size-4" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : (
            <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="generate">Generate</TabsTrigger>
                <TabsTrigger value="import">Import public key</TabsTrigger>
              </TabsList>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="keypair-name">Name</Label>
                  <Input
                    id="keypair-name"
                    autoFocus
                    maxLength={255}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="operator-key"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use letters, numbers, periods, underscores, or hyphens.
                  </p>
                </div>
                <TabsContent value="generate" className="mt-0 text-sm text-muted-foreground">
                  Nova will generate an SSH key and return its private key once.
                </TabsContent>
                <TabsContent value="import" className="mt-0 space-y-1.5">
                  <Label htmlFor="keypair-public-key">Public key</Label>
                  <Textarea
                    id="keypair-public-key"
                    className="min-h-36 font-mono text-xs"
                    value={publicKey}
                    onChange={(event) => setPublicKey(event.target.value)}
                    placeholder="ssh-ed25519 AAAA…"
                    disabled={isPending}
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}

          {error ? <MutationAlert>{error}</MutationAlert> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {privateKey ? "Done" : "Cancel"}
            </Button>
            {!privateKey ? (
              <Button
                type="button"
                disabled={!name.trim() || (mode === "import" && !publicKey.trim()) || isPending}
                onClick={submit}
              >
                {isPending
                  ? mode === "generate" ? "Generating" : "Importing"
                  : mode === "generate" ? "Generate key pair" : "Import key pair"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
