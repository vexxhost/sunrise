"use client";

import { useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  SecurityServiceMutationDialog,
  type SecurityServiceMutationKind,
} from "@/components/SharedFileSystem/SecurityServiceMutationDialog";
import { Badge } from "@/components/ui/badge";
import { securityServicesQueryOptions } from "@/hooks/queries/useManila";
import type { ManilaSecurityService } from "@/types/openstack";

function typeLabel(type: ManilaSecurityService["type"]) {
  return type === "active_directory"
    ? "Active Directory"
    : type === "kerberos"
      ? "Kerberos"
      : "LDAP";
}

const columns: ColumnDef<ManilaSecurityService>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableHiding: false,
    cell: ({ row }) => (
      <ResourceLink
        href={`/shared-file-systems/security-services/${encodeURIComponent(row.original.id)}`}
      >
        {row.original.name || "Unnamed security service"}
      </ResourceLink>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "id",
    header: "ID",
    enableHiding: false,
    meta: {
      fieldType: "string",
      visible: true,
      monospace: true,
      idLinkPath: "/shared-file-systems/security-services",
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => typeLabel(row.original.type),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "active" ? "secondary" : "outline"}
      >
        {row.original.status || "Unknown"}
      </Badge>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    id: "share-networks",
    accessorFn: (service) => service.share_networks?.length ?? 0,
    header: "Share Networks",
    meta: { fieldType: "number", visible: true },
  },
  {
    accessorKey: "server",
    header: "Server",
    cell: ({ row }) => row.original.server || "-",
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
];

export function SecurityServicesClient({
  projectId,
  regionId,
}: {
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const query = useMemo(
    () => securityServicesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(query);
  const [target, setTarget] = useState<ManilaSecurityService | null>(null);
  const [action, setAction] = useState<SecurityServiceMutationKind | null>(
    null,
  );
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const rowActions = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (rows: ManilaSecurityService[]) => {
          setTarget(rows[0] ?? null);
          setAction("edit");
        },
        isDisabled: (rows: ManilaSecurityService[]) => rows.length !== 1,
      },
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: (rows: ManilaSecurityService[]) => {
          setTarget(rows[0] ?? null);
          setAction("delete");
        },
        isDisabled: (rows: ManilaSecurityService[]) => rows.length !== 1,
      },
    ],
    [],
  );
  const closeDialog = () => {
    setTarget(null);
    setAction(null);
  };

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={ShieldCheck}
        getRowId={(service) => service.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="security service"
        rowActions={rowActions}
      />
      {target && action && scope ? (
        <SecurityServiceMutationDialog
          key={`${target.id}:${action}`}
          action={action}
          service={target}
          scope={scope}
          onOpenChange={closeDialog}
          onComplete={async () => {
            await queryClient.invalidateQueries({ queryKey: query.queryKey });
          }}
        />
      ) : null}
    </>
  );
}
