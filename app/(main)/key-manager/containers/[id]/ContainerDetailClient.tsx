"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Package, Plus, Save, Trash2 } from "lucide-react";

import { SecretPicker } from "@/components/KeyManager/SecretPicker";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  containerQueryOptions,
  containersQueryOptions,
} from "@/hooks/queries/useBarbican";
import { removeBarbicanPageItem } from "@/lib/openstack/barbican-cache";
import {
  addContainerConsumerAction,
  addContainerSecretAction,
  deleteContainerAction,
  removeContainerConsumerAction,
  removeContainerSecretAction,
  updateContainerAclAction,
} from "@/lib/openstack/barbican-actions";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type {
  BarbicanContainer,
  BarbicanContainerConsumer,
  BarbicanContainerSecretRef,
  BarbicanPage,
  BarbicanSecret,
} from "@/types/openstack";

export function ContainerDetailClient({
  containerId,
  projectId,
  regionId,
  secrets,
}: {
  containerId: string;
  projectId: string;
  regionId: string;
  secrets: BarbicanSecret[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useSuspenseQuery(
    containerQueryOptions(regionId, projectId, containerId),
  );
  const { container, acl } = query.data;
  const scope: MutationScope = { projectId, regionId };
  const [projectAccess, setProjectAccess] = useState(acl.read.projectAccess);
  const [aclUsers, setAclUsers] = useState(acl.read.users.join("\n"));
  const [referenceName, setReferenceName] = useState("");
  const [selectedSecretId, setSelectedSecretId] = useState("");
  const [consumerName, setConsumerName] = useState("");
  const [consumerUrl, setConsumerUrl] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = container.name || "Unnamed container";
  const refresh = async () => {
    const next = await query.refetch();
    if (next.data) {
      setProjectAccess(next.data.acl.read.projectAccess);
      setAclUsers(next.data.acl.read.users.join("\n"));
    }
  };
  const saveAcl = async () => {
    setPending("acl");
    setError(null);
    const result = await updateContainerAclAction(scope, container.id, {
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
  const addSecret = async () => {
    const secret = secrets.find(({ id }) => id === selectedSecretId);
    if (!secret) return;
    setPending("secret");
    setError(null);
    const result = await addContainerSecretAction(scope, container.id, {
      name: referenceName || undefined,
      secretRef: secret.secret_ref,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setReferenceName("");
    setSelectedSecretId("");
    setMessage(result.message);
    await refresh();
  };
  const removeSecret = async (reference: BarbicanContainerSecretRef) => {
    setPending(`secret:${reference.secret_id}`);
    setError(null);
    const result = await removeContainerSecretAction(scope, container.id, {
      name: reference.name || undefined,
      secretRef: reference.secret_ref,
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
    const result = await addContainerConsumerAction(scope, container.id, {
      name: consumerName,
      url: consumerUrl,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setConsumerName("");
    setConsumerUrl("");
    setMessage(result.message);
    await refresh();
  };
  const removeConsumer = async (consumer: BarbicanContainerConsumer) => {
    setPending(`consumer:${consumer.name}:${consumer.URL}`);
    setError(null);
    const result = await removeContainerConsumerAction(scope, container.id, {
      name: consumer.name,
      url: consumer.URL,
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
    const result = await deleteContainerAction(scope, container.id);
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    queryClient.setQueryData<BarbicanPage<BarbicanContainer>>(
      containersQueryOptions(regionId, projectId).queryKey,
      (page) => removeBarbicanPageItem(page, container.id),
    );
    router.replace("/key-manager/containers");
    router.refresh();
  };

  return (
    <div className="max-w-screen-xl space-y-6">
      <RecentResourceTracker
        kind="secret-container"
        id={container.id}
        name={displayName}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <Package className="size-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{displayName}</h1>
              <Badge variant="outline">{container.type}</Badge>
              <Badge
                variant={
                  container.status === "ACTIVE" ? "secondary" : "outline"
                }
              >
                {container.status}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {container.id}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" />
          Delete container
        </Button>
      </div>
      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      {error && !deleteOpen ? <MutationAlert>{error}</MutationAlert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Container">
          <DetailField label="Name">{displayName}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {container.id}
          </DetailField>
          <DetailField label="Type">{container.type}</DetailField>
          <DetailField label="Reference" className="font-mono text-xs">
            {container.container_ref}
          </DetailField>
        </DetailSection>
        <DetailSection title="Record properties">
          <DetailField label="Created">
            {formatUtcTimestamp(container.created)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(container.updated)}
          </DetailField>
          <DetailField label="Secrets">
            {container.secret_refs.length}
          </DetailField>
          <DetailField label="Consumers">
            {container.consumers.length}
          </DetailField>
        </DetailSection>
      </div>
      <DetailSection title="Secret references">
        <div className="divide-y">
          {container.secret_refs.map((reference) => (
            <div
              key={`${reference.name}:${reference.secret_id}`}
              className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center"
            >
              <div>{reference.name || "Unnamed reference"}</div>
              <ResourceLink
                className="font-mono text-xs"
                href={`/key-manager/secrets/${encodeURIComponent(reference.secret_id)}`}
              >
                {reference.secret_id}
              </ResourceLink>
              {container.type === "generic" ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending !== null}
                  title="Remove secret reference"
                  onClick={() => removeSecret(reference)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove reference</span>
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {container.type === "generic" ? (
            <div className="grid gap-3 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="container-reference-name">Reference name</Label>
                <Input
                  id="container-reference-name"
                  value={referenceName}
                  onChange={(event) => setReferenceName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="container-reference-secret">Secret</Label>
                <SecretPicker
                  disabledIds={container.secret_refs.map(
                    ({ secret_id }) => secret_id,
                  )}
                  id="container-reference-secret"
                  onValueChange={setSelectedSecretId}
                  secrets={secrets}
                  value={selectedSecretId}
                />
              </div>
              <Button
                size="icon"
                title="Add secret reference"
                disabled={pending !== null || !selectedSecretId}
                onClick={addSecret}
              >
                <Plus className="size-4" />
                <span className="sr-only">Add reference</span>
              </Button>
            </div>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Typed container references follow fixed Barbican role names and
              cannot be changed after creation.
            </p>
          )}
        </div>
      </DetailSection>
      <div className="grid gap-6 xl:grid-cols-2">
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
                  When disabled, access is limited to the creator and listed
                  Keystone user IDs.
                </span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="container-acl-users">Additional user IDs</Label>
              <Textarea
                id="container-acl-users"
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
        <DetailSection title="Consumers">
          <div className="divide-y">
            {container.consumers.map((consumer) => (
              <div
                key={`${consumer.name}:${consumer.URL}`}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center"
              >
                <div>{consumer.name}</div>
                <div className="font-mono text-xs">{consumer.URL}</div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending !== null}
                  onClick={() => removeConsumer(consumer)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove consumer</span>
                </Button>
              </div>
            ))}
            <div className="grid gap-3 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="container-consumer-name">Name</Label>
                <Input
                  id="container-consumer-name"
                  value={consumerName}
                  onChange={(event) => setConsumerName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="container-consumer-url">URL</Label>
                <Input
                  id="container-consumer-url"
                  value={consumerUrl}
                  onChange={(event) => setConsumerUrl(event.target.value)}
                />
              </div>
              <Button
                size="icon"
                title="Register consumer"
                disabled={
                  pending !== null ||
                  !consumerName.trim() ||
                  !consumerUrl.trim()
                }
                onClick={addConsumer}
              >
                <Plus className="size-4" />
                <span className="sr-only">Register consumer</span>
              </Button>
            </div>
          </div>
        </DetailSection>
      </div>
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
        title="Delete secret container?"
        description="The referenced secrets are retained, but applications using this container will lose access."
        confirmLabel="Delete container"
        pendingLabel="Deleting container"
        confirmDisabled={confirmation !== displayName}
        error={deleteOpen ? error : null}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="delete-container-detail-confirmation">
            Type <span className="font-mono">{displayName}</span> to confirm
          </Label>
          <Input
            id="delete-container-detail-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
