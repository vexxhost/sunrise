"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareWarning, Trash2 } from "lucide-react";

import { DataTable } from "@/components/DataTable";
import {
  formatUserMessageResourceType,
  UserMessageResourceLink,
} from "@/components/SharedFileSystem/UserMessageResourceLink";
import { UserMessageDeleteDialog } from "@/components/SharedFileSystem/UserMessageDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { userMessagesQueryOptions } from "@/hooks/queries/useManila";
import type { ManilaUserMessage } from "@/types/openstack";

function messageLevelVariant(level: string) {
  return level.toUpperCase() === "ERROR" ? "destructive" : "secondary";
}

const columns: ColumnDef<ManilaUserMessage>[] = [
  {
    accessorKey: "id",
    header: "ID",
    enableHiding: false,
    meta: {
      fieldType: "string",
      visible: true,
      monospace: true,
      idResourceKind: "user-message",
    },
  },
  {
    accessorKey: "message_level",
    header: "Level",
    cell: ({ row }) => (
      <Badge variant={messageLevelVariant(row.original.message_level)}>
        {row.original.message_level || "Unknown"}
      </Badge>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "resource_type",
    header: "Resource Type",
    cell: ({ row }) =>
      formatUserMessageResourceType(row.original.resource_type),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "resource_id",
    header: "Resource ID",
    cell: ({ row }) => <UserMessageResourceLink message={row.original} />,
    meta: { fieldType: "string", visible: true, monospace: true },
  },
  {
    accessorKey: "user_message",
    header: "User Message",
    cell: ({ row }) => (
      <p
        className="max-w-2xl line-clamp-2 whitespace-normal break-words"
        title={row.original.user_message}
      >
        {row.original.user_message}
      </p>
    ),
    meta: { fieldType: "string", visible: true },
  },
  {
    accessorKey: "created_at",
    header: "Age",
    meta: { fieldType: "date", dateDisplay: "age", visible: true },
  },
  {
    accessorKey: "expires_at",
    header: "Expires",
    meta: { fieldType: "date", visible: false },
  },
  {
    accessorKey: "request_id",
    header: "Request ID",
    meta: { fieldType: "string", visible: false, monospace: true },
  },
  {
    accessorKey: "action_id",
    header: "Action ID",
    meta: { fieldType: "string", visible: false, monospace: true },
  },
  {
    accessorKey: "detail_id",
    header: "Detail ID",
    meta: { fieldType: "string", visible: false, monospace: true },
  },
];

export function UserMessagesClient({
  projectId,
  regionId,
}: {
  projectId?: string;
  regionId?: string;
}) {
  const queryClient = useQueryClient();
  const query = useMemo(
    () => userMessagesQueryOptions(regionId, projectId),
    [projectId, regionId],
  );
  const { data, isRefetching, refetch } = useSuspenseQuery(query);
  const [targets, setTargets] = useState<ManilaUserMessage[]>([]);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const closeDialog = useCallback(() => setTargets([]), []);
  const refreshAfterDelete = useCallback(
    async (deletedMessages: ManilaUserMessage[]) => {
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
      await Promise.all(
        deletedMessages.map((message) =>
          queryClient.invalidateQueries({
            queryKey: [
              regionId,
              projectId,
              "manila",
              "user-message",
              message.id,
            ],
          }),
        ),
      );
    },
    [projectId, query.queryKey, queryClient, regionId],
  );
  const rowActions = useMemo(
    () => [
      {
        label: "Delete",
        icon: Trash2,
        variant: "destructive" as const,
        onClick: setTargets,
        isDisabled: (rows: ManilaUserMessage[]) => rows.length === 0,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyIcon={MessageSquareWarning}
        getRowId={(message) => message.id}
        isRefetching={isRefetching}
        refetch={refetch}
        resourceName="user message"
        rowActions={rowActions}
      />
      {targets.length > 0 && scope ? (
        <UserMessageDeleteDialog
          key={targets.map((message) => message.id).join(":")}
          messages={targets}
          onComplete={refreshAfterDelete}
          onOpenChange={closeDialog}
          scope={scope}
        />
      ) : null}
    </>
  );
}
