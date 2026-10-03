"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  SecurityServiceMutationDialog,
  type SecurityServiceMutationKind,
} from "@/components/SharedFileSystem/SecurityServiceMutationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  securityServiceQueryOptions,
  securityServicesQueryOptions,
} from "@/hooks/queries/useManila";
import { formatUtcTimestamp } from "@/lib/openstack/time";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

export function SecurityServiceDetailClient({
  projectId,
  regionId,
  serviceId,
}: {
  projectId?: string;
  regionId?: string;
  serviceId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useMemo(
    () => securityServiceQueryOptions(regionId, projectId, serviceId),
    [projectId, regionId, serviceId],
  );
  const { data: service } = useSuspenseQuery(query);
  const servicesQuery = useQuery(
    securityServicesQueryOptions(regionId, projectId),
  );
  const [action, setAction] = useState<SecurityServiceMutationKind | null>(
    null,
  );
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const displayName = service.name || "Unnamed security service";
  const typeLabel =
    service.type === "active_directory"
      ? "Active Directory"
      : service.type === "kerberos"
        ? "Kerberos"
        : "LDAP";
  const attachedNetworks =
    servicesQuery.data?.find(({ id }) => id === service.id)?.share_networks ??
    service.share_networks ??
    [];

  const refresh = async (deleted: boolean) => {
    await queryClient.invalidateQueries({
      queryKey: securityServicesQueryOptions(regionId, projectId).queryKey,
    });
    if (deleted) {
      router.replace("/shared-file-systems/security-services");
      router.refresh();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: query.queryKey });
  };

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{displayName}</h1>
            <Badge variant="outline">{typeLabel}</Badge>
            <Badge
              variant={service.status === "active" ? "secondary" : "outline"}
            >
              {service.status || "Unknown"}
            </Badge>
          </div>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {service.id}
          </p>
        </div>
        <div className="flex gap-2">
          <EditActionButton
            label="Edit security service"
            disabled={!scope}
            onClick={() => setAction("edit")}
          />
          <Button
            size="icon"
            variant="outline"
            className="text-destructive hover:text-destructive"
            title="Delete security service"
            disabled={!scope}
            onClick={() => setAction("delete")}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete security service</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Security Service">
          <DetailField label="Name">{displayName}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {service.id}
          </DetailField>
          <DetailField label="Type">{typeLabel}</DetailField>
          <DetailField label="Status">
            {emptyToDash(service.status)}
          </DetailField>
          <DetailField label="Description">
            {emptyToDash(service.description)}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {emptyToDash(service.project_id)}
          </DetailField>
        </DetailSection>
        <DetailSection title="Directory Configuration">
          <DetailField label="Server">
            {emptyToDash(service.server)}
          </DetailField>
          <DetailField label="DNS address">
            {emptyToDash(service.dns_ip)}
          </DetailField>
          <DetailField label="Domain">
            {emptyToDash(service.domain)}
          </DetailField>
          <DetailField label="Organizational unit">
            {emptyToDash(service.ou)}
          </DetailField>
          <DetailField label="User">{emptyToDash(service.user)}</DetailField>
          <DetailField label="Password">Stored by Manila</DetailField>
        </DetailSection>
        <DetailSection title="Share Networks">
          {attachedNetworks.length ? (
            attachedNetworks.map((network) => (
              <DetailField
                key={network.id}
                label={network.name || "Share network"}
              >
                <ResourceLink
                  href={`/shared-file-systems/share-networks/${encodeURIComponent(network.id)}`}
                  className="font-mono text-xs"
                >
                  {network.id}
                </ResourceLink>
              </DetailField>
            ))
          ) : (
            <DetailField label="Attachments">None</DetailField>
          )}
        </DetailSection>
        <DetailSection title="Record Properties">
          <DetailField label="Created">
            {formatUtcTimestamp(service.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(service.updated_at)}
          </DetailField>
        </DetailSection>
      </div>

      {action && scope ? (
        <SecurityServiceMutationDialog
          key={action}
          action={action}
          service={service}
          scope={scope}
          onComplete={refresh}
          onOpenChange={() => setAction(null)}
        />
      ) : null}
    </div>
  );
}
