"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Download, Plus, Save, Trash2, Vault } from "lucide-react";

import { JsonEditor } from "@/components/JsonEditor";
import { SecretPayloadRevealDialog } from "@/components/KeyManager/SecretPayloadRevealDialog";
import { SecretPayloadUploadSheet } from "@/components/KeyManager/SecretPayloadUploadSheet";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  secretQueryOptions,
  secretsQueryOptions,
} from "@/hooks/queries/useBarbican";
import { removeBarbicanPageItem } from "@/lib/openstack/barbican-cache";
import {
  addSecretConsumerAction,
  deleteSecretAction,
  removeSecretConsumerAction,
  replaceSecretMetadataAction,
  updateSecretAclAction,
} from "@/lib/openstack/barbican-actions";
import { metadataSchema } from "@/lib/openstack/barbican-input";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type {
  BarbicanPage,
  BarbicanSecret,
  BarbicanSecretConsumer,
} from "@/types/openstack";

function parseMetadata(
  value: string,
):
  | { ok: true; metadata: Record<string, string> }
  | { ok: false; errors: string[] } {
  try {
    const parsed = metadataSchema.safeParse({ metadata: JSON.parse(value) });
    return parsed.success
      ? { ok: true, metadata: parsed.data.metadata }
      : {
          ok: false,
          errors: parsed.error.issues.map(({ message }) => message),
        };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Invalid JSON"],
    };
  }
}

export function SecretDetailClient({
  secretId,
  projectId,
  regionId,
}: {
  secretId: string;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryOptions = secretQueryOptions(regionId, projectId, secretId);
  const query = useSuspenseQuery(queryOptions);
  const { secret, metadata, acl, consumers } = query.data;
  const scope: MutationScope = { projectId, regionId };
  const [metadataValue, setMetadataValue] = useState(() =>
    JSON.stringify(metadata, null, 2),
  );
  const parsedMetadata = useMemo(
    () => parseMetadata(metadataValue),
    [metadataValue],
  );
  const [projectAccess, setProjectAccess] = useState(acl.read.projectAccess);
  const [aclUsers, setAclUsers] = useState(acl.read.users.join("\n"));
  const [service, setService] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = secret.name || "Unnamed secret";
  const hasPayload = Object.keys(secret.content_types).length > 0;

  const refresh = async () => {
    const next = await query.refetch();
    if (next.data) {
      setMetadataValue(JSON.stringify(next.data.metadata, null, 2));
      setProjectAccess(next.data.acl.read.projectAccess);
      setAclUsers(next.data.acl.read.users.join("\n"));
    }
  };
  const saveMetadata = async () => {
    if (!parsedMetadata.ok) return;
    setPending("metadata");
    setError(null);
    const result = await replaceSecretMetadataAction(scope, secret.id, {
      metadata: parsedMetadata.metadata,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage(result.message);
    await refresh();
  };
  const saveAcl = async () => {
    setPending("acl");
    setError(null);
    const result = await updateSecretAclAction(scope, secret.id, {
      projectAccess,
      users: aclUsers
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage(result.message);
    await refresh();
  };
  const addConsumer = async () => {
    setPending("consumer");
    setError(null);
    const result = await addSecretConsumerAction(scope, secret.id, {
      service,
      resourceType,
      resourceId,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setService("");
    setResourceType("");
    setResourceId("");
    setMessage(result.message);
    await refresh();
  };
  const removeConsumer = async (consumer: BarbicanSecretConsumer) => {
    setPending(`consumer:${consumer.service}:${consumer.resource_id}`);
    setError(null);
    const result = await removeSecretConsumerAction(scope, secret.id, {
      service: consumer.service,
      resourceType: consumer.resource_type,
      resourceId: consumer.resource_id,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMessage(result.message);
    await refresh();
  };
  const remove = async () => {
    if (confirmation !== displayName) return;
    setPending("delete");
    setError(null);
    const result = await deleteSecretAction(scope, secret.id);
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    queryClient.setQueryData<BarbicanPage<BarbicanSecret>>(
      secretsQueryOptions(regionId, projectId).queryKey,
      (page) => removeBarbicanPageItem(page, secret.id),
    );
    router.replace("/key-manager/secrets");
    router.refresh();
  };

  return (
    <div className="max-w-screen-xl space-y-6">
      <RecentResourceTracker kind="secret" id={secret.id} name={displayName} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <Vault className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{displayName}</h1>
              <Badge
                variant={secret.status === "ACTIVE" ? "secondary" : "outline"}
              >
                {secret.status}
              </Badge>
              <Badge variant="outline">{secret.secret_type}</Badge>
            </div>
            <p className="mt-1 truncate font-mono text-sm text-muted-foreground">
              {secret.id}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPayload ? (
            <>
              <SecretPayloadRevealDialog
                secretId={secret.id}
                projectId={projectId}
                regionId={regionId}
              />
              <Button asChild variant="outline">
                <a
                  href={`/api/key-manager/secrets/${encodeURIComponent(secret.id)}/payload`}
                  download
                >
                  <Download className="size-4" />
                  Download payload
                </a>
              </Button>
            </>
          ) : (
            <SecretPayloadUploadSheet
              secretId={secret.id}
              projectId={projectId}
              regionId={regionId}
              onUploaded={refresh}
            />
          )}
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete secret
          </Button>
        </div>
      </div>
      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteOpen ? <MutationAlert>{error}</MutationAlert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Secret">
          <DetailField label="Name">{displayName}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {secret.id}
          </DetailField>
          <DetailField label="Type">{secret.secret_type}</DetailField>
          <DetailField label="Content types">
            {Object.entries(secret.content_types)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ") || "Payload not supplied"}
          </DetailField>
          <DetailField label="Creator ID" className="font-mono text-xs">
            {secret.creator_id}
          </DetailField>
        </DetailSection>
        <DetailSection title="Cryptographic metadata">
          <DetailField label="Algorithm">{secret.algorithm}</DetailField>
          <DetailField label="Bit length">{secret.bit_length}</DetailField>
          <DetailField label="Mode">{secret.mode}</DetailField>
          <DetailField label="Expires">
            {secret.expiration
              ? formatUtcTimestamp(secret.expiration)
              : "Never"}
          </DetailField>
        </DetailSection>
        <DetailSection title="Record properties">
          <DetailField label="Created">
            {formatUtcTimestamp(secret.created)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(secret.updated)}
          </DetailField>
          <DetailField label="Reference" className="font-mono text-xs">
            {secret.secret_ref}
          </DetailField>
        </DetailSection>
        <DetailSection title="Read access">
          <div className="space-y-4 p-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={projectAccess}
                onCheckedChange={(checked) =>
                  setProjectAccess(checked === true)
                }
              />
              <span>
                <span className="font-medium">Allow project access</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  When disabled, only the creator and explicitly listed Keystone
                  user IDs can read this secret.
                </span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="secret-acl-users">Additional user IDs</Label>
              <Textarea
                id="secret-acl-users"
                className="min-h-24 font-mono text-xs"
                value={aclUsers}
                onChange={(event) => setAclUsers(event.target.value)}
                placeholder="One Keystone user ID per line"
              />
            </div>
            <Button size="sm" disabled={pending !== null} onClick={saveAcl}>
              <Save className="size-4" />
              Save access policy
            </Button>
          </div>
        </DetailSection>
      </div>
      <DetailSection title="Metadata">
        <div className="space-y-3 p-3">
          <JsonEditor
            label="Secret metadata JSON"
            value={metadataValue}
            onChange={setMetadataValue}
            errors={parsedMetadata.ok ? [] : parsedMetadata.errors}
            height="220px"
          />
          <Button
            size="sm"
            disabled={pending !== null || !parsedMetadata.ok}
            onClick={saveMetadata}
          >
            <Save className="size-4" />
            Save metadata
          </Button>
        </div>
      </DetailSection>
      <DetailSection title="Consumers">
        <div className="divide-y">
          {consumers.map((consumer) => (
            <div
              key={`${consumer.service}:${consumer.resource_type}:${consumer.resource_id}`}
              className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-center"
            >
              <div>{consumer.service}</div>
              <div>{consumer.resource_type}</div>
              <div className="font-mono text-xs">{consumer.resource_id}</div>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending !== null}
                title="Remove consumer"
                onClick={() => removeConsumer(consumer)}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Remove consumer</span>
              </Button>
            </div>
          ))}
          <div className="grid gap-3 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="secret-consumer-service">Service</Label>
              <Input
                id="secret-consumer-service"
                value={service}
                onChange={(event) => setService(event.target.value)}
                placeholder="compute"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secret-consumer-type">Resource type</Label>
              <Input
                id="secret-consumer-type"
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
                placeholder="server"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secret-consumer-id">Resource ID</Label>
              <Input
                id="secret-consumer-id"
                className="font-mono"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              />
            </div>
            <Button
              size="icon"
              title="Register consumer"
              disabled={
                pending !== null ||
                !service.trim() ||
                !resourceType.trim() ||
                !resourceId.trim()
              }
              onClick={addConsumer}
            >
              <Plus className="size-4" />
              <span className="sr-only">Register consumer</span>
            </Button>
          </div>
        </div>
      </DetailSection>
      <MutationConfirmationDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setConfirmation("");
            setError(null);
          }
        }}
        onConfirm={remove}
        pending={pending === "delete"}
        title="Delete secret?"
        description="This permanently removes the secret payload and metadata. Registered consumers must be removed first."
        confirmLabel="Delete secret"
        pendingLabel="Deleting secret"
        confirmDisabled={confirmation !== displayName}
        error={deleteOpen ? error : null}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="delete-secret-detail-confirmation">
            Type <span className="font-mono">{displayName}</span> to confirm
          </Label>
          <Input
            id="delete-secret-detail-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
