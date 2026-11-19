"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import {
  addressListIssues,
  addressesFromText,
} from "@/components/Network/AddressGroupCreateAction";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { EditActionButton } from "@/components/resources/EditActionButton";
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
  addAddressGroupAddressesAction,
  deleteAddressGroupAction,
  removeAddressGroupAddressesAction,
  updateAddressGroupAction,
} from "@/lib/openstack/neutron-actions";
import type { AddressGroup } from "@/types/openstack";

type DialogName = "add" | "delete" | "edit" | null;

export function AddressGroupDetailActions({
  group,
  projectId,
  regionId,
}: {
  group: AddressGroup;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [addressText, setAddressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
    router.refresh();
  };
  const openEdit = () => {
    setName(group.name);
    setDescription(group.description);
    setError(null);
    setDialog("edit");
  };
  const openAdd = () => {
    setAddressText("");
    setError(null);
    setDialog("add");
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateAddressGroupAction(
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
  const submitAddresses = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const addresses = addressesFromText(addressText);
    const issues = addressListIssues(addresses);
    if (!addresses.length || issues.length) {
      setError(issues[0] ?? "Enter at least one CIDR.");
      return;
    }
    startTransition(async () => {
      const result = await addAddressGroupAddressesAction(
        { projectId, regionId },
        group.id,
        { addresses },
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
      const result = await deleteAddressGroupAction(
        { projectId, regionId },
        group.id,
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDialog(null);
      router.replace("/networking/address-groups");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add addresses
        </Button>
        <EditActionButton label="Edit address group" onClick={openEdit} />
        <Button
          variant="outline"
          tone="danger"
          onClick={() => {
            setError(null);
            setDialog("delete");
          }}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
      <Dialog
        open={dialog === "edit"}
        onOpenChange={(next) => !next && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit address group</DialogTitle>
              <DialogDescription>
                Update the group identity without changing its addresses.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-group-name">Name</Label>
                <Input
                  id="edit-address-group-name"
                  required
                  maxLength={255}
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-address-group-description">
                  Description
                </Label>
                <Textarea
                  id="edit-address-group-description"
                  maxLength={1024}
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
              <Button type="submit" loading={pending} disabled={!name.trim()}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "add"}
        onOpenChange={(next) => !next && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <form className="space-y-5" onSubmit={submitAddresses}>
            <DialogHeader>
              <DialogTitle>Add addresses</DialogTitle>
              <DialogDescription>
                Neutron adds the complete set atomically. Existing entries are
                preserved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="add-address-group-addresses">
                IPv4 and IPv6 CIDRs
              </Label>
              <Textarea
                id="add-address-group-addresses"
                className="min-h-40 font-mono"
                placeholder={"10.20.0.0/16\n192.0.2.10/32\n2001:db8::1/128"}
                value={addressText}
                disabled={pending}
                onChange={(event) => setAddressText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter one CIDR per line. Use /32 for one IPv4 address or /128
                for one IPv6 address. You can also separate entries with commas.
              </p>
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
              <Button
                type="submit"
                loading={pending}
                disabled={!addressText.trim()}
              >
                Add addresses
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MutationConfirmationDialog
        open={dialog === "delete"}
        onOpenChange={(next) => !next && setDialog(null)}
        title="Delete address group?"
        description="Neutron rejects deletion while a security group rule still references this group."
        confirmLabel="Delete address group"
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

export function AddressGroupAddressActions({
  address,
  groupId,
  projectId,
  regionId,
}: {
  address: string;
  groupId: string;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmRemove = () => {
    startTransition(async () => {
      const result = await removeAddressGroupAddressesAction(
        { projectId, regionId },
        groupId,
        { addresses: [address] },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: [regionId, projectId] });
      router.refresh();
    });
  };

  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        tone="danger"
        title={`Remove ${address}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        <span className="sr-only">Remove {address}</span>
      </Button>
      <MutationConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove address?"
        description="Security group rules that reference this group stop matching this address immediately."
        confirmLabel="Remove address"
        pendingLabel="Removing"
        pending={pending}
        error={error}
        variant="destructive"
        onConfirm={confirmRemove}
      >
        <div className="rounded-md border px-3 py-2 font-mono text-sm">
          {address}
        </div>
      </MutationConfirmationDialog>
    </>
  );
}
