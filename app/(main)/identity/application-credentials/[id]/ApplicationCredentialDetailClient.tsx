"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteApplicationCredentialAction } from "@/lib/openstack/application-credential-actions";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type { ApplicationCredential } from "@/types/openstack";

function timestamp(value: string | null) {
  if (!value) return "Does not expire";
  const date = new Date(normalizeOpenStackTimestamp(value));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ApplicationCredentialDetailClient({
  credential,
  projectId,
  regionId,
}: {
  credential: ApplicationCredential;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scope: MutationScope = { projectId, regionId };

  const remove = () => {
    if (confirmation !== credential.name) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteApplicationCredentialAction(
        scope,
        credential.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push("/identity/application-credentials");
      router.refresh();
    });
  };

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <KeyRound className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {credential.name}
              </h1>
              {credential.unrestricted ? (
                <Badge variant="destructive">Delegation allowed</Badge>
              ) : (
                <Badge variant="outline">Delegation blocked</Badge>
              )}
            </div>
            <p className="mt-1 truncate font-mono text-sm text-muted-foreground">
              {credential.id}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Delete credential
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Credential">
          <DetailField label="Name">{credential.name}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {credential.id}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {credential.project_id}
          </DetailField>
          <DetailField label="Description">
            {credential.description || "-"}
          </DetailField>
          <DetailField label="Expires">
            {timestamp(credential.expires_at)}
          </DetailField>
          <DetailField label="Credential delegation">
            {credential.unrestricted ? "Allowed" : "Blocked"}
          </DetailField>
        </DetailSection>

        <DetailSection title="Effective roles">
          {credential.roles.length ? (
            credential.roles.map((role) => (
              <DetailField key={role.id} label={role.name} className="font-mono text-xs">
                {role.id}
              </DetailField>
            ))
          ) : (
            <DetailField label="Roles">-</DetailField>
          )}
        </DetailSection>
      </div>

      <DetailSection title="Access rules">
        {credential.access_rules.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Service type</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Rule ID</th>
                </tr>
              </thead>
              <tbody>
                {credential.access_rules.map((rule, index) => (
                  <tr key={rule.id ?? index} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{rule.service ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {rule.method ?? "-"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {rule.path ?? "-"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {rule.id ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No API access rules restrict this credential.
          </p>
        )}
      </DetailSection>

      <MutationConfirmationDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false);
            setConfirmation("");
            setError(null);
          }
        }}
        onConfirm={remove}
        pending={pending}
        title="Delete application credential?"
        description="Workloads using this credential will immediately lose access. This cannot be undone."
        confirmLabel="Delete credential"
        pendingLabel="Deleting credential"
        confirmDisabled={confirmation !== credential.name}
        error={error}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="delete-application-credential-detail-confirmation">
            Type <span className="font-mono">{credential.name}</span> to
            confirm
          </Label>
          <Input
            id="delete-application-credential-detail-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
