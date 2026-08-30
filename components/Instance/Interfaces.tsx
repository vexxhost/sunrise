"use client";

import { DataTable } from "@/components/DataTable";
import { IDCell } from "@/components/DataTable/IDCell";
import type { Port } from "@/types/openstack";
import type { ColumnDef } from "@tanstack/react-table";
import { Network } from "lucide-react";

export const columns: ColumnDef<Port>[] = [
  {
    accessorKey: "id",
    header: "Port ID",
    enableHiding: false,
    cell: ({ row }) => (
      <IDCell value={row.original.id} isSelected={row.getIsSelected()} />
    ),
    meta: {
      fieldType: "string",
      monospace: true,
      visible: true,
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) =>
      row.original.name || (
        <span className="text-muted-foreground">Not named</span>
      ),
    meta: {
      fieldType: "string",
      visible: false,
    },
  },
  {
    accessorKey: "network_name",
    header: "Network",
    cell: ({ row }) =>
      row.original.network_name || (
        <span className="font-mono text-muted-foreground">
          {row.original.network_id}
        </span>
      ),
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "fixed_ips",
    header: "Fixed IP addresses",
    cell: ({ row }) =>
      row.original.fixed_ips.length > 0
        ? row.original.fixed_ips.map(({ ip_address }) => ip_address).join(", ")
        : "-",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "mac_address",
    header: "MAC address",
    meta: {
      fieldType: "string",
      visible: true,
      monospace: true,
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: {
      fieldType: "string",
      visible: true,
    },
  },
  {
    accessorKey: "admin_state_up",
    header: "Admin state",
    cell: ({ row }) => (row.original.admin_state_up ? "Up" : "Down"),
    meta: {
      fieldType: "boolean",
      visible: false,
    },
  },
];

export function Interfaces({ networkPorts }: { networkPorts: Port[] }) {
  return (
    <DataTable
      columns={columns}
      data={networkPorts}
      emptyIcon={Network}
      resourceName="interface"
    />
  );
}
