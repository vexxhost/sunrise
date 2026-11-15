"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { UserMessageDeleteDialog } from "@/components/SharedFileSystem/UserMessageDeleteDialog";
import {
  formatUserMessageResourceType,
  UserMessageResourceLink,
} from "@/components/SharedFileSystem/UserMessageResourceLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { userMessageQueryOptions } from "@/hooks/queries/useManila";
import { formatUtcTimestamp } from "@/lib/openstack/time";

function messageLevelVariant(level: string) {
  return level.toUpperCase() === "ERROR" ? "destructive" : "secondary";
}

export function UserMessageDetailClient({
  messageId,
  projectId,
  regionId,
}: {
  messageId: string;
  projectId?: string;
  regionId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const messageQuery = useMemo(
    () => userMessageQueryOptions(regionId, projectId, messageId),
    [messageId, projectId, regionId],
  );
  const { data: message } = useSuspenseQuery(messageQuery);
  const [deleting, setDeleting] = useState(false);
  const scope = useMemo(
    () => (projectId ? { projectId, regionId } : null),
    [projectId, regionId],
  );
  const refreshAfterDelete = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [regionId, projectId, "manila", "user-messages"],
    });
    router.replace("/shared-file-systems/user-messages");
  }, [projectId, queryClient, regionId, router]);

  return (
    <div className="max-w-screen-xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">User message</h1>
            <Badge variant={messageLevelVariant(message.message_level)}>
              {message.message_level || "Unknown"}
            </Badge>
          </div>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {message.id}
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          title="Delete user message"
          disabled={!scope}
          onClick={() => setDeleting(true)}
          tone="danger"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete user message</span>
        </Button>
      </div>

      <div className="space-y-6 rounded-md border bg-card p-4 text-card-foreground">
        <DetailSection title="Diagnostic">
          <DetailField label="User message" className="whitespace-pre-wrap">
            {message.user_message}
          </DetailField>
          <DetailField label="Message level">
            <Badge variant={messageLevelVariant(message.message_level)}>
              {message.message_level || "Unknown"}
            </Badge>
          </DetailField>
          <DetailField label="Action ID" className="font-mono text-xs">
            {message.action_id || "-"}
          </DetailField>
          <DetailField label="Detail ID" className="font-mono text-xs">
            {message.detail_id || "-"}
          </DetailField>
        </DetailSection>

        <DetailSection title="Affected Resource">
          <DetailField label="Resource type">
            {formatUserMessageResourceType(message.resource_type)}
          </DetailField>
          <DetailField label="Resource ID" className="font-mono text-xs">
            <UserMessageResourceLink message={message} />
          </DetailField>
        </DetailSection>

        <DetailSection title="Request and Retention">
          <DetailField label="Request ID" className="font-mono text-xs">
            {message.request_id || "-"}
          </DetailField>
          <DetailField label="Project ID" className="font-mono text-xs">
            {message.project_id || "-"}
          </DetailField>
          <DetailField label="Created">
            {formatUtcTimestamp(message.created_at)}
          </DetailField>
          <DetailField label="Expires">
            {formatUtcTimestamp(message.expires_at)}
          </DetailField>
        </DetailSection>
      </div>

      {deleting && scope ? (
        <UserMessageDeleteDialog
          messages={[message]}
          onComplete={refreshAfterDelete}
          onOpenChange={() => setDeleting(false)}
          scope={scope}
        />
      ) : null}
    </div>
  );
}
