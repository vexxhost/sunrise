'use client';

import { useCallback, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { Checkbox } from "@/components/ui/checkbox";

import { createServerAction } from "@/lib/openstack/nova-actions";
import type {
  Flavor,
  Image,
  Keypair,
  Network,
  SecurityGroup,
} from "@/types/openstack";

interface InstanceActionsProps {
  regionId?: string;
  images: Image[];
  flavors: Flavor[];
  networks: Network[];
  securityGroups: SecurityGroup[];
  keypairs: Keypair[];
  onAfterAction?: () => Promise<void> | void;
}

interface LaunchFormState {
  name: string;
  imageRef: string;
  flavorRef: string;
  keyName: string;
  networkIds: string[];
  securityGroupNames: string[];
  availabilityZone: string;
  metadata: string;
  userData: string;
  configDrive: boolean;
}

const INITIAL_FORM: LaunchFormState = {
  name: "",
  imageRef: "",
  flavorRef: "",
  keyName: "",
  networkIds: [],
  securityGroupNames: [],
  availabilityZone: "",
  metadata: "",
  userData: "",
  configDrive: false,
};

export function InstanceActions({
  regionId,
  images,
  flavors,
  networks,
  securityGroups,
  keypairs,
  onAfterAction,
}: InstanceActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<LaunchFormState>(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasNetworkOptions = networks.length > 0;
  const hasSecurityGroupOptions = securityGroups.length > 0;

  const isSubmitDisabled = useMemo(() => {
    return !form.name.trim() || !form.flavorRef || !form.imageRef;
  }, [form.flavorRef, form.imageRef, form.name]);

  const encodedUserData = useCallback((value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    try {
      return btoa(unescape(encodeURIComponent(value)));
    } catch {
      return undefined;
    }
  }, []);

  const resetForm = useCallback(() => {
    setForm((prev) => ({
      ...INITIAL_FORM,
      imageRef: images[0]?.id ?? "",
      flavorRef: flavors[0]?.id ?? "",
      keyName: keypairs[0]?.name ?? "",
      networkIds: networks[0]?.id ? [networks[0].id] : [],
      securityGroupNames: [],
    }));
    setErrorMessage(null);
  }, [flavors, images, keypairs, networks]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        resetForm();
      } else {
        setErrorMessage(null);
      }
      setIsOpen(open);
    },
    [resetForm],
  );

  const toggleSelection = <T extends string>(values: T[], value: T): T[] => {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  };

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const metadata = form.metadata.trim();
      let parsedMetadata: Record<string, string> | undefined;

      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata) as Record<string, string>;
        } catch {
          setErrorMessage("Metadata must be valid JSON.");
          return;
        }
      }

      startTransition(async () => {
        setErrorMessage(null);
        try {
          await createServerAction(
            {
              name: form.name.trim(),
              flavorRef: form.flavorRef,
              imageRef: form.imageRef,
              key_name: form.keyName || undefined,
              networks: form.networkIds.length
                ? form.networkIds.map((id) => ({ uuid: id }))
                : undefined,
              security_groups: form.securityGroupNames.length
                ? form.securityGroupNames.map((name) => ({ name }))
                : undefined,
              availability_zone: form.availabilityZone || undefined,
              metadata: parsedMetadata,
              user_data: encodedUserData(form.userData),
              config_drive: form.configDrive || undefined,
            },
            regionId,
          );

          setIsOpen(false);
          resetForm();
          if (onAfterAction) {
            await onAfterAction();
          }
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to launch instance.");
        }
      });
    },
    [encodedUserData, form, onAfterAction, regionId, resetForm],
  );

  return (
    <>
      <ButtonGroup>
        <Button
          variant="default"
          size="sm"
          className="gap-2 h-10"
          onClick={() => handleOpenChange(true)}
        >
          <Plus className="h-4 w-4" />
          Launch Instance
        </Button>
      </ButtonGroup>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Launch Instance</DialogTitle>
              <DialogDescription>
                Provide launch configuration details. Required fields are marked with an asterisk (*).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="launch-name">Name *</Label>
                <Input
                  id="launch-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={isPending}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-image">Image *</Label>
                <select
                  id="launch-image"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.imageRef}
                  onChange={(event) => setForm((prev) => ({ ...prev, imageRef: event.target.value }))}
                  disabled={isPending}
                  required
                >
                  <option value="">Select an image</option>
                  {images.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.name || image.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-flavor">Flavor *</Label>
                <select
                  id="launch-flavor"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.flavorRef}
                  onChange={(event) => setForm((prev) => ({ ...prev, flavorRef: event.target.value }))}
                  disabled={isPending}
                  required
                >
                  <option value="">Select a flavor</option>
                  {flavors.map((flavor) => (
                    <option key={flavor.id} value={flavor.id}>
                      {flavor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-keypair">Key pair (optional)</Label>
                <select
                  id="launch-keypair"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.keyName}
                  onChange={(event) => setForm((prev) => ({ ...prev, keyName: event.target.value }))}
                  disabled={isPending}
                >
                  <option value="">No key pair</option>
                  {keypairs.map((keypair) => (
                    <option key={keypair.name} value={keypair.name}>
                      {keypair.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Networks</Label>
                <div className="space-y-2">
                  {hasNetworkOptions ? (
                    networks.map((network) => (
                      <div key={network.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`launch-network-${network.id}`}
                          checked={form.networkIds.includes(network.id)}
                          onCheckedChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              networkIds: toggleSelection(prev.networkIds, network.id),
                            }))
                          }
                          disabled={isPending}
                        />
                        <Label htmlFor={`launch-network-${network.id}`} className="font-normal">
                          {network.name || network.id}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No networks available.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Security groups</Label>
                <div className="space-y-2">
                  {hasSecurityGroupOptions ? (
                    securityGroups.map((group) => (
                      <div key={group.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`launch-sg-${group.id}`}
                          checked={form.securityGroupNames.includes(group.name)}
                          onCheckedChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              securityGroupNames: toggleSelection(prev.securityGroupNames, group.name),
                            }))
                          }
                          disabled={isPending}
                        />
                        <Label htmlFor={`launch-sg-${group.id}`} className="font-normal">
                          {group.name}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No security groups available.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-az">Availability zone (optional)</Label>
                <Input
                  id="launch-az"
                  value={form.availabilityZone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, availabilityZone: event.target.value }))
                  }
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-metadata">Metadata (optional JSON)</Label>
                <Textarea
                  id="launch-metadata"
                  value={form.metadata}
                  onChange={(event) => setForm((prev) => ({ ...prev, metadata: event.target.value }))}
                  disabled={isPending}
                  placeholder='{"role":"app"}'
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="launch-userdata">User data (optional cloud-config)</Label>
                <Textarea
                  id="launch-userdata"
                  value={form.userData}
                  onChange={(event) => setForm((prev) => ({ ...prev, userData: event.target.value }))}
                  disabled={isPending}
                  placeholder="#cloud-config\npower_state_change: reboot"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="launch-config-drive"
                  checked={form.configDrive}
                  onCheckedChange={(value) =>
                    setForm((prev) => ({ ...prev, configDrive: Boolean(value) }))
                  }
                  disabled={isPending}
                />
                <Label htmlFor="launch-config-drive" className="font-normal">
                  Enable config drive
                </Label>
              </div>

              {errorMessage && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitDisabled || isPending}>
                {isPending ? "Launching…" : "Launch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
