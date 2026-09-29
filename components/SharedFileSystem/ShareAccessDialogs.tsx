"use client";

import { useState, useTransition } from "react";
import { ShieldMinus, ShieldPlus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  grantShareAccessAction,
  revokeShareAccessAction,
} from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaShareAccessRule } from "@/types/openstack";

export function GrantShareAccessDialog({
  onComplete,
  onOpenChange,
  scope,
  shareId,
}: {
  onComplete: () => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  shareId: string;
}) {
  const [accessType, setAccessType] = useState<"ip" | "cert" | "user">("ip");
  const [accessTo, setAccessTo] = useState("");
  const [accessLevel, setAccessLevel] = useState<"rw" | "ro">("rw");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeholder =
    accessType === "ip"
      ? "10.0.0.0/24"
      : accessType === "cert"
        ? "client.example.com"
        : "client-user";

  const submit = () => {
    if (!accessTo.trim() || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await grantShareAccessAction(scope, shareId, {
        accessType,
        accessTo,
        accessLevel,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldPlus className="size-5" />
            Grant share access
          </DialogTitle>
          <DialogDescription>
            Authorize a client identity or network to mount this share.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="share-access-type">Access type</Label>
            <Select
              value={accessType}
              onValueChange={(value) =>
                setAccessType(value as "ip" | "cert" | "user")
              }
              disabled={pending}
            >
              <SelectTrigger id="share-access-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ip">IP network</SelectItem>
                <SelectItem value="cert">Certificate</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-access-level">Access level</Label>
            <Select
              value={accessLevel}
              onValueChange={(value) => setAccessLevel(value as "rw" | "ro")}
              disabled={pending}
            >
              <SelectTrigger id="share-access-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rw">Read and write</SelectItem>
                <SelectItem value="ro">Read only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="share-access-to">Client</Label>
            <Input
              id="share-access-to"
              value={accessTo}
              onChange={(event) => setAccessTo(event.target.value)}
              placeholder={placeholder}
              maxLength={255}
              autoComplete="off"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              The selected protocol and storage driver determine which access
              types are supported.
            </p>
          </div>
        </div>

        {error ? <MutationAlert>{error}</MutationAlert> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !accessTo.trim()}>
            {pending ? "Granting" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeShareAccessDialog({
  onComplete,
  onOpenChange,
  rule,
  scope,
  shareId,
}: {
  onComplete: () => Promise<void> | void;
  onOpenChange: () => void;
  rule: ManilaShareAccessRule;
  scope: MutationScope;
  shareId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const revoke = () => {
    startTransition(async () => {
      setError(null);
      const result = await revokeShareAccessAction(scope, shareId, rule.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldMinus className="size-5 text-destructive" />
            Revoke share access
          </DialogTitle>
          <DialogDescription>
            Remove {rule.access_level} access for {rule.access_to}. Existing
            clients can lose access immediately.
          </DialogDescription>
        </DialogHeader>
        {error ? <MutationAlert>{error}</MutationAlert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={revoke} disabled={pending}>
            {pending ? "Revoking" : "Revoke access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
