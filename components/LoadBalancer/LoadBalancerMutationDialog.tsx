"use client";

import { useState, useTransition } from "react";

import {
  OctaviaTagsEditor,
  octaviaTagDraft,
  type OctaviaTagDraft,
} from "@/components/LoadBalancer/OctaviaTags";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import {
  deleteLoadBalancerAction,
  updateLoadBalancerAction,
} from "@/lib/openstack/octavia-actions";
import { sameOctaviaTags } from "@/lib/openstack/octavia-tags";
import type { MutationScope } from "@/lib/mutations";
import type { OctaviaLoadBalancer } from "@/types/openstack";

export type LoadBalancerMutationKind = "delete" | "edit";

export function LoadBalancerMutationDialog({
  action,
  loadBalancer,
  onComplete,
  onOpenChange,
  scope,
  tagSupport,
}: {
  action: LoadBalancerMutationKind;
  loadBalancer: OctaviaLoadBalancer;
  onComplete: (deleted: boolean) => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  tagSupport: OpenStackFeatureSupport;
}) {
  const [initial] = useState(() => ({ loadBalancer, scope }));
  const original = initial.loadBalancer;
  const originalTags = Array.isArray(original.tags) ? original.tags : undefined;
  const [name, setName] = useState(original.name);
  const [description, setDescription] = useState(original.description ?? "");
  const [adminStateUp, setAdminStateUp] = useState(original.admin_state_up);
  const [tags, setTags] = useState<OctaviaTagDraft[]>(() =>
    (originalTags ?? []).map(octaviaTagDraft),
  );
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagUpdatesAvailable =
    tagSupport.status !== "unsupported" && originalTags !== undefined;
  const submittedTags = tags
    .map((tag) => tag.value)
    .filter((tag) => tag.length > 0);
  const tagsChanged =
    tagUpdatesAvailable && !sameOctaviaTags(originalTags, submittedTags);
  const detailsChanged =
    name !== original.name ||
    description !== (original.description ?? "") ||
    adminStateUp !== original.admin_state_up;
  const dependencyCount =
    (loadBalancer.listeners?.length ?? 0) + (loadBalancer.pools?.length ?? 0);
  const confirmationLabel = loadBalancer.name || loadBalancer.id;

  const close = () => {
    if (pending) return;
    setError(null);
    onOpenChange();
  };

  const run = (
    operation: () => Promise<{ ok: boolean; error?: { message: string } }>,
    deleted: boolean,
  ) => {
    startTransition(async () => {
      setError(null);
      const result = await operation();
      if (!result.ok) {
        setError(
          result.error?.message ?? "The operation could not be completed.",
        );
        return;
      }
      onOpenChange();
      await onComplete(deleted);
    });
  };

  if (action === "delete") {
    return (
      <MutationConfirmationDialog
        confirmDisabled={
          dependencyCount > 0 || confirmation !== confirmationLabel
        }
        confirmLabel="Delete load balancer"
        description="This permanently removes the load balancer. Listener and pool topology must be removed first."
        error={error}
        onConfirm={() =>
          run(() => deleteLoadBalancerAction(initial.scope, original.id), true)
        }
        onOpenChange={(open) => !open && close()}
        open
        pending={pending}
        pendingLabel="Deleting load balancer"
        title="Delete load balancer?"
        variant="destructive"
      >
        <div className="space-y-3">
          {dependencyCount > 0 ? (
            <MutationAlert variant="warning" title="Topology still attached">
              Remove the {loadBalancer.listeners?.length ?? 0} listener(s) and{" "}
              {loadBalancer.pools?.length ?? 0} pool(s) before deleting this
              load balancer.
            </MutationAlert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="delete-load-balancer-confirmation">
              Type <span className="font-mono">{confirmationLabel}</span> to
              confirm
            </Label>
            <Input
              autoComplete="off"
              disabled={pending || dependencyCount > 0}
              id="delete-load-balancer-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </div>
        </div>
      </MutationConfirmationDialog>
    );
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detailsChanged && !tagsChanged) return;
    run(
      () =>
        updateLoadBalancerAction(initial.scope, original.id, {
          name,
          description,
          adminStateUp,
          ...(tagsChanged ? { tags: submittedTags } : {}),
          source: {
            name: original.name,
            description: original.description ?? "",
            adminStateUp: original.admin_state_up,
            ...(tagsChanged ? { tags: originalTags } : {}),
          },
        }),
      false,
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit load balancer</DialogTitle>
            <DialogDescription>
              Change the display properties and administrative state.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="edit-load-balancer-name">Name</Label>
            <Input
              autoFocus
              disabled={pending}
              id="edit-load-balancer-name"
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-load-balancer-description">Description</Label>
            <Textarea
              disabled={pending}
              id="edit-load-balancer-description"
              maxLength={255}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={adminStateUp}
              disabled={pending}
              id="edit-load-balancer-admin-state"
              onCheckedChange={(value) => setAdminStateUp(value === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="edit-load-balancer-admin-state">
                Admin state up
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow the load balancer to handle traffic.
              </p>
            </div>
          </div>

          {tagUpdatesAvailable ? (
            <OctaviaTagsEditor
              disabled={pending}
              idPrefix="edit-load-balancer-tag"
              onChange={setTags}
              tags={tags}
            />
          ) : (
            <MutationAlert variant="info" title="Tags unavailable">
              {tagSupport.status === "unsupported"
                ? tagSupport.message
                : "Octavia did not return the existing tags. Refresh before editing them."}
            </MutationAlert>
          )}
          {error ? <MutationAlert>{error}</MutationAlert> : null}

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!detailsChanged && !tagsChanged}
              loading={pending}
              type="submit"
            >
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
