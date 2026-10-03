"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link2, Plus, Trash2, Unlink } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { EditActionButton } from "@/components/resources/EditActionButton";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  ShareNetworkDeleteDialog,
  ShareNetworkSecurityServiceAttachDialog,
  ShareNetworkSecurityServiceDetachDialog,
  ShareNetworkSubnetCreateDialog,
  ShareNetworkSubnetDeleteDialog,
} from "@/components/SharedFileSystem/ShareNetworkLifecycleDialogs";
import { ShareNetworkMutationDialog } from "@/components/SharedFileSystem/ShareNetworkMutationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  securityServicesQueryOptions,
  shareNetworkQueryOptions,
  shareNetworkSecurityServicesQueryOptions,
  shareNetworkSubnetsQueryOptions,
} from "@/hooks/queries/useManila";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type {
  ManilaSecurityService,
  ManilaShareNetworkSubnet,
} from "@/types/openstack";

function emptyToDash(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function securityServiceType(type: ManilaSecurityService["type"]) {
  return type === "active_directory"
    ? "Active Directory"
    : type === "kerberos"
      ? "Kerberos"
      : "LDAP";
}

export function ShareNetworkDetailClient({
  networkId,
  projectId,
  regionId,
}: {
  networkId: string;
  projectId?: string;
  regionId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useMemo(
    () => shareNetworkQueryOptions(regionId, projectId, networkId),
    [networkId, projectId, regionId],
  );
  const { data: network } = useSuspenseQuery(query);
  const subnetsQuery = useQuery({
    ...shareNetworkSubnetsQueryOptions(regionId, projectId, networkId),
    initialData: network.share_network_subnets ?? [],
  });
  const securityServicesQuery = useQuery(
    securityServicesQueryOptions(regionId, projectId),
  );
  const attachedServicesQuery = useQuery(
    shareNetworkSecurityServicesQueryOptions(regionId, projectId, networkId),
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingSubnet, setAddingSubnet] = useState(false);
  const [deletingSubnet, setDeletingSubnet] =
    useState<ManilaShareNetworkSubnet | null>(null);
  const [attachingService, setAttachingService] = useState(false);
  const [detachingService, setDetachingService] =
    useState<ManilaSecurityService | null>(null);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const subnets = subnetsQuery.data ?? [];
  const attachedServices = attachedServicesQuery.data ?? [];

  const refreshNetwork = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
      queryClient.invalidateQueries({
        queryKey: [regionId, projectId, "manila", "share-networks"],
      }),
      queryClient.invalidateQueries({
        queryKey: shareNetworkSubnetsQueryOptions(
          regionId,
          projectId,
          networkId,
        ).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: shareNetworkSecurityServicesQueryOptions(
          regionId,
          projectId,
          networkId,
        ).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: securityServicesQueryOptions(regionId, projectId).queryKey,
      }),
    ]);
  }, [networkId, projectId, query.queryKey, queryClient, regionId]);

  const finishDelete = async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "manila", "share-networks"],
    });
    router.replace("/shared-file-systems/share-networks");
    router.refresh();
  };

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold">
            {network.name || "Unnamed share network"}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {network.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditActionButton
            label="Edit share network"
            disabled={!scope}
            onClick={() => setEditing(true)}
          />
          <Button
            size="icon"
            variant="outline"
            className="text-destructive hover:text-destructive"
            title="Delete share network"
            disabled={!scope}
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete share network</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Share Network">
          <DetailField label="Name">{emptyToDash(network.name)}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {network.id}
          </DetailField>
          <DetailField label="Description">
            {emptyToDash(network.description)}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {emptyToDash(network.project_id)}
          </DetailField>
          <DetailField label="Status">
            {emptyToDash(network.status)}
          </DetailField>
        </DetailSection>
        <DetailSection title="Record Properties">
          <DetailField label="Created">
            {formatUtcTimestamp(network.created_at)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(network.updated_at)}
          </DetailField>
          <DetailField label="Network subnets">{subnets.length}</DetailField>
          <DetailField label="Security services">
            {attachedServices.length}
          </DetailField>
        </DetailSection>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Network Subnets</h2>
            <p className="text-sm text-muted-foreground">
              Neutron placements used by Manila share servers in each storage
              availability zone.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!scope}
            onClick={() => setAddingSubnet(true)}
          >
            <Plus className="size-4" />
            Add subnet
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Availability Zone</TableHead>
                <TableHead>Neutron Network</TableHead>
                <TableHead>Neutron Subnet</TableHead>
                <TableHead>CIDR</TableHead>
                <TableHead>IP Version</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subnetsQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Network subnets are unavailable for the current role.
                  </TableCell>
                </TableRow>
              ) : subnets.length ? (
                subnets.map((subnet) => (
                  <TableRow key={subnet.id}>
                    <TableCell>
                      {subnet.availability_zone || "All storage zones"}
                    </TableCell>
                    <TableCell>
                      {subnet.neutron_net_id ? (
                        <ResourceLink
                          href={`/networking/networks/${encodeURIComponent(subnet.neutron_net_id)}`}
                          className="font-mono text-xs"
                        >
                          {subnet.neutron_net_id}
                        </ResourceLink>
                      ) : (
                        "Service managed"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {emptyToDash(subnet.neutron_subnet_id)}
                    </TableCell>
                    <TableCell>{emptyToDash(subnet.cidr)}</TableCell>
                    <TableCell>{emptyToDash(subnet.ip_version)}</TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="Delete network subnet"
                        disabled={!scope}
                        onClick={() => setDeletingSubnet(subnet)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete network subnet</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No network subnets are attached.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Security Services</h2>
            <p className="text-sm text-muted-foreground">
              Directory and authentication settings available to share servers
              on this network.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!scope || securityServicesQuery.isLoading}
            onClick={() => setAttachingService(true)}
          >
            <Link2 className="size-4" />
            Attach service
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Server</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachedServicesQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Security-service attachments are unavailable for the current
                    role.
                  </TableCell>
                </TableRow>
              ) : attachedServices.length ? (
                attachedServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <ResourceLink
                        href={`/shared-file-systems/security-services/${encodeURIComponent(service.id)}`}
                      >
                        {service.name || service.id}
                      </ResourceLink>
                    </TableCell>
                    <TableCell>{securityServiceType(service.type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {service.status || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>{emptyToDash(service.server)}</TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="Detach security service"
                        disabled={!scope}
                        onClick={() => setDetachingService(service)}
                      >
                        <Unlink className="size-4" />
                        <span className="sr-only">Detach security service</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No security services are attached.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {editing && scope ? (
        <ShareNetworkMutationDialog
          network={network}
          onComplete={refreshNetwork}
          onOpenChange={() => setEditing(false)}
          scope={scope}
        />
      ) : null}
      {addingSubnet && scope ? (
        <ShareNetworkSubnetCreateDialog
          existingSubnets={subnets}
          network={network}
          onComplete={refreshNetwork}
          onOpenChange={() => setAddingSubnet(false)}
          scope={scope}
        />
      ) : null}
      {deletingSubnet && scope ? (
        <ShareNetworkSubnetDeleteDialog
          network={network}
          subnet={deletingSubnet}
          onComplete={refreshNetwork}
          onOpenChange={() => setDeletingSubnet(null)}
          scope={scope}
        />
      ) : null}
      {attachingService && scope ? (
        <ShareNetworkSecurityServiceAttachDialog
          attachedServices={attachedServices}
          availableServices={securityServicesQuery.data ?? []}
          network={network}
          onComplete={refreshNetwork}
          onOpenChange={() => setAttachingService(false)}
          scope={scope}
        />
      ) : null}
      {detachingService && scope ? (
        <ShareNetworkSecurityServiceDetachDialog
          network={network}
          service={detachingService}
          onComplete={refreshNetwork}
          onOpenChange={() => setDetachingService(null)}
          scope={scope}
        />
      ) : null}
      {deleting && scope ? (
        <ShareNetworkDeleteDialog
          network={network}
          onComplete={finishDelete}
          onOpenChange={() => setDeleting(false)}
          scope={scope}
        />
      ) : null}
    </div>
  );
}
