"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
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
  SecurityGroupRuleFields,
  type SecurityRuleDirection,
  type SecurityRuleEthertype,
  type SecurityRuleRemoteType,
} from "@/components/Network/SecurityGroupRuleFields";
import {
  createSecurityGroupRuleAction,
  deleteSecurityGroupAction,
  deleteSecurityGroupRuleAction,
  replaceSecurityGroupRuleAction,
  updateSecurityGroupAction,
} from "@/lib/openstack/neutron-actions";
import type { SecurityGroup, SecurityGroupRule } from "@/types/openstack";

export function SecurityGroupDetailActions({
  group,
  groups,
  projectId,
  regionId,
}: {
  group: SecurityGroup;
  groups: SecurityGroup[];
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"delete" | "edit" | "rule" | null>(null);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [direction, setDirection] = useState<SecurityRuleDirection>("ingress");
  const [ethertype, setEthertype] = useState<SecurityRuleEthertype>("IPv4");
  const [protocol, setProtocol] = useState("tcp");
  const [portMin, setPortMin] = useState("");
  const [portMax, setPortMax] = useState("");
  const [remoteType, setRemoteType] = useState<SecurityRuleRemoteType>("cidr");
  const [remote, setRemote] = useState("0.0.0.0/0");
  const [ruleDescription, setRuleDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
  const open = (next: typeof dialog) => {
    setError(null);
    if (next === "edit") {
      setName(group.name);
      setDescription(group.description);
    }
    if (next === "rule") {
      setDirection("ingress");
      setEthertype("IPv4");
      setProtocol("tcp");
      setPortMin("");
      setPortMax("");
      setRemoteType("cidr");
      setRemote("0.0.0.0/0");
      setRuleDescription("");
    }
    setDialog(next);
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateSecurityGroupAction(
        { projectId, regionId },
        group.id,
        { name, description },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const submitRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createSecurityGroupRuleAction(
        { projectId, regionId },
        {
          securityGroupId: group.id,
          description: ruleDescription,
          direction,
          ethertype,
          protocol: protocol === "any" ? undefined : protocol,
          portRangeMin: portMin ? Number(portMin) : undefined,
          portRangeMax: portMax ? Number(portMax) : undefined,
          remoteIpPrefix:
            remoteType === "cidr" ? remote || undefined : undefined,
          remoteGroupId:
            remoteType === "group" ? remote || undefined : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const confirmDelete = () => {
    startTransition(async () => {
      const result = await deleteSecurityGroupAction(
        { projectId, regionId },
        group.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/compute/networks/security-groups");
    });
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9 gap-2" onClick={() => open("rule")}>
          <Plus className="size-4" />
          Add rule
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2"
          onClick={() => open("edit")}
        >
          <Pencil className="size-4" />
          Edit
        </Button>
        <Button
          variant="outline"
          className="h-9 gap-2 text-destructive hover:text-destructive"
          disabled={group.name === "default"}
          onClick={() => open("delete")}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit security group</DialogTitle>
              <DialogDescription>
                Update the policy name and description. Existing rules are
                unchanged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-group-name">Name</Label>
                <Input
                  id="edit-group-name"
                  required
                  value={name}
                  disabled={pending || group.name === "default"}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-group-description">Description</Label>
                <Textarea
                  id="edit-group-description"
                  value={description}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "rule"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <form className="space-y-5" onSubmit={submitRule}>
            <DialogHeader>
              <DialogTitle>Add security group rule</DialogTitle>
              <DialogDescription>
                Allow a protocol and optional port range from a CIDR or another
                security group.
              </DialogDescription>
            </DialogHeader>
            <SecurityGroupRuleFields
              idPrefix="add-rule"
              description={ruleDescription}
              direction={direction}
              disabled={pending}
              ethertype={ethertype}
              groups={groups}
              portMax={portMax}
              portMin={portMin}
              protocol={protocol}
              remote={remote}
              remoteType={remoteType}
              onDescriptionChange={setRuleDescription}
              onDirectionChange={setDirection}
              onEthertypeChange={setEthertype}
              onPortMaxChange={setPortMax}
              onPortMinChange={setPortMin}
              onProtocolChange={setProtocol}
              onRemoteChange={setRemote}
              onRemoteTypeChange={setRemoteType}
            />
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || (remoteType !== "any" && !remote)}
              >
                {pending ? "Adding" : "Add rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete security group?"
        description="The group must not be assigned to any ports. Its rules are permanently removed."
        confirmLabel="Delete security group"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      >
        <div className="rounded-md border px-3 py-2 text-sm">
          {group.name || group.id}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}

function ruleInput(rule: SecurityGroupRule) {
  return {
    securityGroupId: rule.security_group_id,
    description: rule.description || "",
    direction: rule.direction,
    ethertype: rule.ethertype,
    protocol: rule.protocol || undefined,
    portRangeMin: rule.port_range_min ?? undefined,
    portRangeMax: rule.port_range_max ?? undefined,
    remoteIpPrefix: rule.remote_ip_prefix || undefined,
    remoteGroupId: rule.remote_group_id || undefined,
  };
}

export function SecurityGroupRuleActions({
  groups,
  projectId,
  regionId,
  rule,
}: {
  groups: SecurityGroup[];
  projectId: string;
  regionId: string;
  rule: SecurityGroupRule;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"delete" | "edit" | null>(null);
  const [description, setDescription] = useState(rule.description || "");
  const [direction, setDirection] = useState<SecurityRuleDirection>(
    rule.direction,
  );
  const [ethertype, setEthertype] = useState<SecurityRuleEthertype>(
    rule.ethertype,
  );
  const [protocol, setProtocol] = useState(rule.protocol || "any");
  const [portMin, setPortMin] = useState(
    rule.port_range_min === null ? "" : String(rule.port_range_min),
  );
  const [portMax, setPortMax] = useState(
    rule.port_range_max === null ? "" : String(rule.port_range_max),
  );
  const [remoteType, setRemoteType] = useState<SecurityRuleRemoteType>(
    rule.remote_group_id ? "group" : rule.remote_ip_prefix ? "cidr" : "any",
  );
  const [remote, setRemote] = useState(
    rule.remote_group_id || rule.remote_ip_prefix || "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
  const openEdit = () => {
    setDescription(rule.description || "");
    setDirection(rule.direction);
    setEthertype(rule.ethertype);
    setProtocol(rule.protocol || "any");
    setPortMin(rule.port_range_min === null ? "" : String(rule.port_range_min));
    setPortMax(rule.port_range_max === null ? "" : String(rule.port_range_max));
    setRemoteType(
      rule.remote_group_id ? "group" : rule.remote_ip_prefix ? "cidr" : "any",
    );
    setRemote(rule.remote_group_id || rule.remote_ip_prefix || "");
    setError(null);
    setDialog("edit");
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await replaceSecurityGroupRuleAction(
        { projectId, regionId },
        rule.id,
        ruleInput(rule),
        {
          securityGroupId: rule.security_group_id,
          description,
          direction,
          ethertype,
          protocol: protocol === "any" ? undefined : protocol,
          portRangeMin: portMin ? Number(portMin) : undefined,
          portRangeMax: portMax ? Number(portMax) : undefined,
          remoteIpPrefix:
            remoteType === "cidr" ? remote || undefined : undefined,
          remoteGroupId:
            remoteType === "group" ? remote || undefined : undefined,
        },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  const confirmDelete = () => {
    startTransition(async () => {
      const result = await deleteSecurityGroupRuleAction(
        { projectId, regionId },
        rule.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      await refresh();
    });
  };
  return (
    <>
      <div className="flex items-center justify-end">
        <Button
          size="icon"
          variant="ghost"
          title="Edit rule"
          onClick={openEdit}
        >
          <Pencil className="size-4" />
          <span className="sr-only">Edit rule</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Delete rule"
          onClick={() => {
            setError(null);
            setDialog("delete");
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete rule</span>
        </Button>
      </div>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit security group rule</DialogTitle>
              <DialogDescription>
                Neutron replaces individual rules instead of updating them in
                place. Sunrise keeps the original rule if replacement fails.
              </DialogDescription>
            </DialogHeader>
            <SecurityGroupRuleFields
              idPrefix={`edit-rule-${rule.id}`}
              description={description}
              direction={direction}
              disabled={pending}
              ethertype={ethertype}
              groups={groups}
              portMax={portMax}
              portMin={portMin}
              protocol={protocol}
              remote={remote}
              remoteType={remoteType}
              onDescriptionChange={setDescription}
              onDirectionChange={setDirection}
              onEthertypeChange={setEthertype}
              onPortMaxChange={setPortMax}
              onPortMinChange={setPortMin}
              onProtocolChange={setProtocol}
              onRemoteChange={setRemote}
              onRemoteTypeChange={setRemoteType}
            />
            {error ? <MutationAlert>{error}</MutationAlert> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || (remoteType !== "any" && !remote)}
              >
                {pending ? "Saving" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        title="Delete rule?"
        description="Traffic that depends on this rule may be interrupted immediately."
        confirmLabel="Delete rule"
        pendingLabel="Deleting"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </>
  );
}
