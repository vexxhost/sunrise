"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ScrollText, Trash2 } from "lucide-react";

import { OrderCreateSheet } from "@/components/KeyManager/OrderCreateSheet";
import { DataTable } from "@/components/DataTable";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClearCreateActionIntent } from "@/hooks/useClearCreateActionIntent";
import { ordersQueryOptions } from "@/hooks/queries/useBarbican";
import { deleteOrderAction } from "@/lib/openstack/barbican-actions";
import { formatAge } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type { BarbicanOrder, BarbicanPage } from "@/types/openstack";

function orderName(order: BarbicanOrder) {
  return typeof order.meta.name === "string" && order.meta.name.trim()
    ? order.meta.name
    : `${order.type} order`;
}

export function OrdersClient({
  initiallyCreateOpen,
  initialData,
  projectId,
  regionId,
}: {
  initiallyCreateOpen: boolean;
  initialData: BarbicanPage<BarbicanOrder>;
  projectId: string;
  regionId: string;
}) {
  const clearCreateIntent = useClearCreateActionIntent();
  const query = useQuery({
    ...ordersQueryOptions(regionId, projectId),
    initialData,
    retry: false,
    refetchInterval: ({ state }) =>
      state.data?.items.some(({ status }) => status === "PENDING")
        ? 5_000
        : false,
  });
  const [createOpen, setCreateOpen] = useState(initiallyCreateOpen);
  const [deleteTarget, setDeleteTarget] = useState<BarbicanOrder | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope: MutationScope = { projectId, regionId };
  const columns: ColumnDef<BarbicanOrder>[] = [
    {
      id: "name",
      accessorFn: orderName,
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <ResourceLink
          href={`/key-manager/orders/${encodeURIComponent(row.original.id)}`}
        >
          {orderName(row.original)}
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
        idLinkPath: "/key-manager/orders",
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "ACTIVE"
              ? "secondary"
              : row.original.status === "ERROR"
                ? "destructive"
                : "outline"
          }
        >
          {row.original.status}
        </Badge>
      ),
      meta: { fieldType: "string", visible: true },
    },
    {
      id: "algorithm",
      accessorFn: (order) =>
        typeof order.meta.algorithm === "string" ? order.meta.algorithm : "",
      header: "Algorithm",
      meta: { fieldType: "string", visible: true },
    },
    {
      id: "bits",
      accessorFn: (order) =>
        typeof order.meta.bit_length === "number"
          ? order.meta.bit_length
          : null,
      header: "Bits",
      cell: ({ row }) =>
        typeof row.original.meta.bit_length === "number"
          ? String(row.original.meta.bit_length)
          : "-",
      meta: { fieldType: "number", visible: true },
    },
    {
      accessorKey: "created",
      header: "Age",
      cell: ({ row }) => formatAge(row.original.created),
      meta: { fieldType: "date", dateDisplay: "age", visible: true },
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          title={`Delete ${orderName(row.original)}`}
          onClick={() => {
            setConfirmation("");
            setError(null);
            setDeleteTarget(row.original);
          }}
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete order</span>
        </Button>
      ),
      meta: { fieldType: "string", visible: true },
    },
  ];
  const remove = async () => {
    if (!deleteTarget || confirmation !== orderName(deleteTarget)) return;
    setPending(true);
    setError(null);
    const result = await deleteOrderAction(scope, deleteTarget.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDeleteTarget(null);
    setConfirmation("");
    setMessage(result.message);
    await query.refetch();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Key Orders</h1>
          <p className="text-sm text-muted-foreground">
            Server-side symmetric and asymmetric key generation requests.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Generate key
        </Button>
      </div>
      {message ? (
        <MutationAlert variant="success">{message}</MutationAlert>
      ) : null}
      <DataTable
        columns={columns}
        data={query.data.items}
        refetch={query.refetch}
        isRefetching={query.isRefetching}
        resourceName="key order"
        emptyIcon={ScrollText}
        getRowId={(order) => order.id}
      />
      <OrderCreateSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) clearCreateIntent();
        }}
        scope={scope}
        onCreated={async (success) => {
          setMessage(success);
          await query.refetch();
        }}
      />
      <MutationConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setConfirmation("");
            setError(null);
          }
        }}
        onConfirm={remove}
        pending={pending}
        title="Delete key order?"
        description="Deleting the order does not delete any secret or container already generated from it."
        confirmLabel="Delete order"
        pendingLabel="Deleting order"
        confirmDisabled={
          confirmation !== (deleteTarget ? orderName(deleteTarget) : "")
        }
        error={deleteTarget ? error : null}
        variant="destructive"
      >
        {deleteTarget ? (
          <div className="space-y-2">
            <Label htmlFor="delete-order-confirmation">
              Type <span className="font-mono">{orderName(deleteTarget)}</span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-order-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        ) : null}
      </MutationConfirmationDialog>
    </div>
  );
}
