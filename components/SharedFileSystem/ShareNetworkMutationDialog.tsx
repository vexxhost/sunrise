"use client";

import { useState, useTransition } from "react";
import { Link2, Pencil, Unlink } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { updateShareNetworkAction } from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type {
  ManilaSecurityService,
  ManilaShareNetwork,
} from "@/types/openstack";

type SecurityServiceEditor = {
  attachedServices: ManilaSecurityService[];
  attachDisabled: boolean;
  attachDisabledMessage?: string;
  isError: boolean;
  isLoading: boolean;
  onAttach: () => void;
  onDetach: (service: ManilaSecurityService) => void;
};

function securityServiceType(type: ManilaSecurityService["type"]) {
  return type === "active_directory"
    ? "Active Directory"
    : type === "kerberos"
      ? "Kerberos"
      : "LDAP";
}

export function ShareNetworkMutationDialog({
  network,
  onComplete,
  onOpenChange,
  scope,
  securityServices,
}: {
  network: ManilaShareNetwork;
  onComplete: () => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
  securityServices?: SecurityServiceEditor;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "security-services">(
    "details",
  );
  const [name, setName] = useState(network.name ?? "");
  const [description, setDescription] = useState(network.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalid = !name.trim();

  const submit = () => {
    if (invalid || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await updateShareNetworkAction(scope, network.id, {
        name,
        description,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await onComplete();
      onOpenChange();
    });
  };

  const details = (
    <div className="space-y-4 pt-3">
      <div className="space-y-1.5">
        <Label htmlFor="edit-share-network-name">Name</Label>
        <Input
          id="edit-share-network-name"
          value={name}
          maxLength={255}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-share-network-description">Description</Label>
        <Textarea
          id="edit-share-network-description"
          value={description}
          maxLength={255}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onOpenChange()}>
      <DialogContent className={securityServices ? "sm:max-w-2xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" aria-hidden="true" />
            Edit share network
          </DialogTitle>
          <DialogDescription>
            {securityServices
              ? "Update display details or manage the security services attached to this share network."
              : "Update the display name and description. Existing subnet placement and attached share servers are not changed."}
          </DialogDescription>
        </DialogHeader>

        {securityServices ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "details" | "security-services")
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="security-services">
                Security services
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details">{details}</TabsContent>
            <TabsContent value="security-services" className="space-y-4 pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">
                    Attached security services
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Directory and authentication settings used by share servers
                    on this network.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    securityServices.isLoading ||
                    securityServices.attachDisabled
                  }
                  onClick={securityServices.onAttach}
                >
                  <Link2 className="size-4" />
                  Attach service
                </Button>
              </div>

              {securityServices.attachDisabledMessage ? (
                <p className="text-sm text-muted-foreground">
                  {securityServices.attachDisabledMessage}
                </p>
              ) : null}
              {securityServices.isError ? (
                <MutationAlert>
                  Security-service attachments are unavailable for the current
                  role.
                </MutationAlert>
              ) : null}

              <div className="divide-y overflow-hidden rounded-md border">
                {securityServices.attachedServices.length ? (
                  securityServices.attachedServices.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <ResourceLink
                          href={`/shared-file-systems/security-services/${encodeURIComponent(service.id)}`}
                          className="block truncate"
                        >
                          {service.name || service.id}
                        </ResourceLink>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{securityServiceType(service.type)}</span>
                          <Badge variant="outline">
                            {service.status || "Unknown"}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Detach security service"
                        onClick={() => securityServices.onDetach(service)}
                        tone="danger"
                      >
                        <Unlink className="size-4" />
                        <span className="sr-only">Detach security service</span>
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No security services are attached.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          details
        )}

        {error ? <MutationAlert>{error}</MutationAlert> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenChange}
            disabled={pending}
          >
            {activeTab === "details" ? "Cancel" : "Close"}
          </Button>
          {activeTab === "details" ? (
            <Button
              type="button"
              onClick={submit}
              disabled={invalid}
              loading={pending}
            >
              Save changes
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
