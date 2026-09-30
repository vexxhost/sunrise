"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ScrollText, Trash2 } from "lucide-react";

import { JsonEditor } from "@/components/JsonEditor";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { RecentResourceTracker } from "@/components/resources/RecentResourceTracker";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  orderQueryOptions,
  ordersQueryOptions,
} from "@/hooks/queries/useBarbican";
import { removeBarbicanPageItem } from "@/lib/openstack/barbican-cache";
import { deleteOrderAction } from "@/lib/openstack/barbican-actions";
import { barbicanIdFromRef } from "@/lib/openstack/barbican-schema";
import { formatUtcTimestamp } from "@/lib/openstack/time";
import type { MutationScope } from "@/lib/mutations";
import type { BarbicanOrder, BarbicanPage } from "@/types/openstack";

export function OrderDetailClient({
  orderId,
  projectId,
  regionId,
}: {
  orderId: string;
  projectId: string;
  regionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useSuspenseQuery({
    ...orderQueryOptions(regionId, projectId, orderId),
    refetchInterval: ({ state }) =>
      state.data?.status === "PENDING" ? 5_000 : false,
  });
  const order = query.data;
  const name =
    typeof order.meta.name === "string" && order.meta.name.trim()
      ? order.meta.name
      : `${order.type} order`;
  const scope: MutationScope = { projectId, regionId };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (confirmation !== name) return;
    setPending(true);
    setError(null);
    const result = await deleteOrderAction(scope, order.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    queryClient.setQueryData<BarbicanPage<BarbicanOrder>>(
      ordersQueryOptions(regionId, projectId).queryKey,
      (page) => removeBarbicanPageItem(page, order.id),
    );
    router.replace("/key-manager/orders");
    router.refresh();
  };
  const secretId = order.secret_ref
    ? barbicanIdFromRef(order.secret_ref, "secret")
    : null;
  const containerId = order.container_ref
    ? barbicanIdFromRef(order.container_ref, "container")
    : null;
  return (
    <div className="max-w-screen-xl space-y-6">
      <RecentResourceTracker kind="secret-order" id={order.id} name={name} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <ScrollText className="size-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{name}</h1>
              <Badge variant="outline">{order.type}</Badge>
              <Badge
                variant={
                  order.status === "ACTIVE"
                    ? "secondary"
                    : order.status === "ERROR"
                      ? "destructive"
                      : "outline"
                }
              >
                {order.status}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {order.id}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" />
          Delete order
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Order">
          <DetailField label="Name">{name}</DetailField>
          <DetailField label="ID" className="font-mono text-xs">
            {order.id}
          </DetailField>
          <DetailField label="Type">{order.type}</DetailField>
          <DetailField label="Status">{order.status}</DetailField>
          <DetailField label="Status detail">
            {order.sub_status_message ||
              order.sub_status ||
              "No status details reported"}
          </DetailField>
        </DetailSection>
        <DetailSection title="Result">
          <DetailField label="Generated secret">
            {secretId ? (
              <ResourceLink
                href={`/key-manager/secrets/${encodeURIComponent(secretId)}`}
              >
                {secretId}
              </ResourceLink>
            ) : (
              "Not available"
            )}
          </DetailField>
          <DetailField label="Generated container">
            {containerId ? (
              <ResourceLink
                href={`/key-manager/containers/${encodeURIComponent(containerId)}`}
              >
                {containerId}
              </ResourceLink>
            ) : (
              "Not available"
            )}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(order.created)}
          </DetailField>
          <DetailField label="Updated">
            {formatUtcTimestamp(order.updated)}
          </DetailField>
          <DetailField label="Creator ID" className="font-mono text-xs">
            {order.creator_id}
          </DetailField>
        </DetailSection>
      </div>
      <DetailSection title="Requested key metadata">
        <div className="p-3">
          <JsonEditor
            label="Order metadata JSON"
            value={JSON.stringify(order.meta, null, 2)}
            errors={[]}
            height="260px"
            readOnly
          />
        </div>
      </DetailSection>
      <MutationConfirmationDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setConfirmation("");
            setError(null);
          }
        }}
        onConfirm={remove}
        pending={pending}
        title="Delete key order?"
        description="Deleting this record does not delete generated secret or container resources."
        confirmLabel="Delete order"
        pendingLabel="Deleting order"
        confirmDisabled={confirmation !== name}
        error={error}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="delete-order-detail-confirmation">
            Type <span className="font-mono">{name}</span> to confirm
          </Label>
          <Input
            id="delete-order-detail-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
