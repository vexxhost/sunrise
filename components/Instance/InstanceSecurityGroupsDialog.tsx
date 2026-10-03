"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";

import { MutationAlert } from "@/components/mutations/MutationAlert";
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
import { Spinner } from "@/components/ui/spinner";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import {
  addServerSecurityGroupAction,
  removeServerSecurityGroupAction,
} from "@/lib/openstack/nova-actions";
import { normalizeMutationProjectId } from "@/lib/mutations";
import type { Port, SecurityGroup, Server } from "@/types/openstack";

interface InstanceSecurityGroupsDialogProps {
  onComplete: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  ports: Port[];
  projectId?: string;
  regionId?: string;
  server: Server;
}

function portCountForGroup(ports: Port[], groupId: string) {
  return ports.filter((port) => port.security_groups.includes(groupId)).length;
}

export function InstanceSecurityGroupsDialog({
  onComplete,
  onOpenChange,
  open,
  ports,
  projectId,
  regionId,
  server,
}: InstanceSecurityGroupsDialogProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groupsQuery = useQuery({
    ...securityGroupsQueryOptions(regionId, projectId),
    enabled: open && Boolean(regionId && projectId),
  });
  const groups = useMemo(
    () =>
      (groupsQuery.data ?? [])
        .filter(
          (group) =>
            normalizeMutationProjectId(group.project_id) ===
            normalizeMutationProjectId(projectId),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [groupsQuery.data, projectId],
  );
  const groupNameCounts = useMemo(
    () =>
      groups.reduce((counts, group) => {
        counts.set(group.name, (counts.get(group.name) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    [groups],
  );

  const close = () => {
    if (pending) return;
    setOverrides({});
    setError(null);
    onOpenChange(false);
  };

  const desiredState = (group: SecurityGroup) => {
    const count = portCountForGroup(ports, group.id);
    if (group.id in overrides) return overrides[group.id];
    return count === ports.length && ports.length > 0;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !regionId || !Object.keys(overrides).length) return;

    startTransition(async () => {
      setError(null);
      const scope = { projectId, regionId };
      const changes = groups.filter((group) => group.id in overrides);
      for (const group of changes) {
        const result = overrides[group.id]
          ? await addServerSecurityGroupAction(scope, server.id, {
              groupName: group.name,
            })
          : await removeServerSecurityGroupAction(scope, server.id, {
              groupName: group.name,
            });
        if (!result.ok) {
          setError(
            `${group.name || group.id}: ${result.error.message} Refresh before retrying; earlier changes may already be active.`,
          );
          await onComplete();
          return;
        }
      }
      setOverrides({});
      onOpenChange(false);
      await onComplete();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-x-hidden overflow-y-auto">
        <form className="min-w-0 space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Manage instance security groups</DialogTitle>
            <DialogDescription>
              Add or remove groups across every interface attached to this
              instance.
            </DialogDescription>
          </DialogHeader>

          <MutationAlert variant="info" title="Server-wide policy">
            Security groups are enforced by Neutron ports. This action applies
            each change to all {ports.length} attached interfaces. Use the
            Networking tab to manage one exact port.
          </MutationAlert>

          <div className="max-h-72 min-w-0 space-y-2 overflow-y-auto rounded-md border p-3">
            {groups.map((group) => {
              const count = portCountForGroup(ports, group.id);
              const overridden = group.id in overrides;
              const mixed = count > 0 && count < ports.length;
              const duplicateName = (groupNameCounts.get(group.name) ?? 0) > 1;
              const checked = overridden
                ? overrides[group.id]
                : count === ports.length && ports.length > 0
                  ? true
                  : count > 0
                    ? "indeterminate"
                    : false;
              return (
                <label
                  key={group.id}
                  className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    disabled={
                      pending || ports.length === 0 || mixed || duplicateName
                    }
                    onCheckedChange={(value) => {
                      const selected = value === true;
                      const originallyApplied =
                        count === ports.length && ports.length > 0;
                      setOverrides((current) => {
                        const next = { ...current };
                        if (selected === originallyApplied) {
                          delete next[group.id];
                        } else {
                          next[group.id] = selected;
                        }
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {group.name || group.id}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {overridden
                        ? desiredState(group)
                          ? "Will be applied to every interface"
                          : "Will be removed from every interface"
                        : duplicateName
                          ? "Name is not unique; use port-specific policy"
                          : count === ports.length && ports.length > 0
                            ? "Applied to every interface"
                            : mixed
                              ? `Applied to ${count} of ${ports.length} interfaces; use port-specific policy`
                              : "Not applied"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!groupsQuery.isLoading && groups.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No project security groups are available.
              </p>
            ) : null}
          </div>

          {error ? <MutationAlert>{error}</MutationAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending || ports.length === 0 || !Object.keys(overrides).length
              }
            >
              {pending ? <Spinner /> : null}
              {pending ? "Applying changes" : "Apply to all interfaces"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
