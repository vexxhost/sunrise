"use client";

import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ListTree } from "lucide-react";

import { AddressGroupCreateAction } from "@/components/Network/AddressGroupCreateAction";
import { DataTable } from "@/components/DataTable";
import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  addressGroupsQueryOptions,
  isOwnedAddressGroup,
  projectAddressGroupsQueryOptions,
} from "@/hooks/queries/useNetworks";
import type { OpenStackFeatureSupport } from "@/lib/openstack/capabilities";
import type { AddressGroup } from "@/types/openstack";

export function AddressGroupsClient({
  initiallyOpen,
  projectId,
  regionId,
  support,
}: {
  initiallyOpen: boolean;
  projectId: string;
  regionId: string;
  support: OpenStackFeatureSupport;
}) {
  const groups = useSuspenseQuery(
    addressGroupsQueryOptions(regionId, projectId),
  );
  const projectGroups = useSuspenseQuery(
    projectAddressGroupsQueryOptions(regionId, projectId),
  );
  const columns = useMemo<ColumnDef<AddressGroup>[]>(() => {
    const columns: ColumnDef<AddressGroup>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <ResourceLink
            href={`/networking/address-groups/${encodeURIComponent(row.original.id)}`}
          >
            {row.original.name || row.original.id}
          </ResourceLink>
        ),
        meta: { fieldType: "string", visible: true },
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { fieldType: "string", visible: true, monospace: true },
      },
      {
        id: "addresses",
        accessorFn: (group) => group.addresses.length,
        header: "Addresses",
        meta: { fieldType: "number", visible: true },
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { fieldType: "string", visible: true },
      },
      {
        id: "access",
        accessorFn: (group) =>
          isOwnedAddressGroup(group, projectId, projectGroups.data)
            ? "Owned"
            : "Shared",
        header: "Access",
        meta: { fieldType: "string", visible: true },
      },
    ];

    if (groups.data.some((group) => group.created_at)) {
      columns.push({
        accessorKey: "created_at",
        header: "Age",
        meta: { fieldType: "date", dateDisplay: "age", visible: false },
      });
    }

    return columns;
  }, [groups.data, projectGroups.data, projectId]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Reusable IPv4 and IPv6 address sets for security group rules.
        </p>
        <AddressGroupCreateAction
          initiallyOpen={initiallyOpen}
          projectId={projectId}
          regionId={regionId}
          support={support}
        />
      </div>
      <DataTable
        columns={columns}
        data={groups.data}
        emptyIcon={ListTree}
        isRefetching={groups.isRefetching || projectGroups.isRefetching}
        refetch={() => {
          void Promise.all([groups.refetch(), projectGroups.refetch()]);
        }}
        resourceName="address group"
      />
    </>
  );
}
