"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSecurityServiceAction,
  updateSecurityServiceAction,
} from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaSecurityService } from "@/types/openstack";

export type SecurityServiceMutationKind = "edit" | "delete";

export function SecurityServiceMutationDialog({
  action,
  onComplete,
  onOpenChange,
  scope,
  service,
}: {
  action: SecurityServiceMutationKind;
  onComplete: (deleted: boolean) => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  service: ManilaSecurityService;
}) {
  const [name, setName] = useState(service.name ?? "");
  const [description, setDescription] = useState(service.description ?? "");
  const [dnsIp, setDnsIp] = useState(service.dns_ip ?? "");
  const [server, setServer] = useState(service.server ?? "");
  const [domain, setDomain] = useState(service.domain ?? "");
  const [ou, setOu] = useState(service.ou ?? "");
  const [user, setUser] = useState(service.user ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmationName = service.name || service.id;
  const active = service.status?.toLowerCase() === "active";
  const invalid =
    (action === "edit" && !name.trim()) ||
    (action === "delete" && confirmation !== confirmationName);

  const submit = () => {
    if (invalid || pending) return;
    startTransition(async () => {
      setError(null);
      const result =
        action === "edit"
          ? await updateSecurityServiceAction(scope, service.id, {
              name,
              description,
              dnsIp,
              server,
              domain,
              ou,
              user,
              password,
            })
          : await deleteSecurityServiceAction(scope, service.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete(action === "delete");
      onOpenChange();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === "edit" ? <Pencil className="size-5" /> : null}
            {action === "delete" ? (
              <Trash2 className="size-5 text-destructive" />
            ) : null}
            {action === "edit"
              ? "Edit security service"
              : "Delete security service"}
          </DialogTitle>
          <DialogDescription>
            {action === "edit"
              ? active
                ? "This service is active. Manila permits changing only its name and description."
                : "Update the directory connection settings. Leave the password blank to preserve it."
              : "Detach this service from every share network before deleting it."}
          </DialogDescription>
        </DialogHeader>

        {action === "edit" ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-security-service-name">Name</Label>
                <Input
                  id="edit-security-service-name"
                  value={name}
                  maxLength={255}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-security-service-server">Server</Label>
                <Input
                  id="edit-security-service-server"
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  disabled={pending || active}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-security-service-description">
                Description
              </Label>
              <Textarea
                id="edit-security-service-description"
                value={description}
                maxLength={255}
                onChange={(event) => setDescription(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["DNS address", "dns", dnsIp, setDnsIp],
                ["Domain", "domain", domain, setDomain],
                ["Organizational unit", "ou", ou, setOu],
                ["User", "user", user, setUser],
              ].map(([label, id, value, setter]) => (
                <div className="space-y-1.5" key={String(id)}>
                  <Label htmlFor={`edit-security-service-${id}`}>
                    {String(label)}
                  </Label>
                  <Input
                    id={`edit-security-service-${id}`}
                    value={String(value)}
                    onChange={(event) =>
                      (setter as (value: string) => void)(event.target.value)
                    }
                    disabled={pending || active}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="edit-security-service-password">
                  New password
                </Label>
                <Input
                  id="edit-security-service-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={pending || active}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                This operation cannot be undone. Type{" "}
                <strong>{confirmationName}</strong> to confirm.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-security-service-confirmation">
                Security service name
              </Label>
              <Input
                id="delete-security-service-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </div>
          </div>
        )}

        {error ? <MutationAlert>{error}</MutationAlert> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenChange}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={action === "delete" ? "destructive" : "default"}
            onClick={submit}
            disabled={pending || invalid}
          >
            {pending
              ? action === "delete"
                ? "Deleting"
                : "Saving"
              : action === "delete"
                ? "Delete security service"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
