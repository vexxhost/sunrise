"use client";

import { useState } from "react";

import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { deleteUserMessageAction } from "@/lib/openstack/manila-actions";
import type { MutationScope } from "@/lib/mutations";
import type { ManilaUserMessage } from "@/types/openstack";

export function UserMessageDeleteDialog({
  messages,
  onComplete,
  onOpenChange,
  scope,
}: {
  messages: ManilaUserMessage[];
  onComplete: (deletedMessages: ManilaUserMessage[]) => Promise<void> | void;
  onOpenChange: () => void;
  scope: MutationScope;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingMessages, setRemainingMessages] = useState(messages);

  const remove = async () => {
    setPending(true);
    setError(null);

    const results = await Promise.allSettled(
      remainingMessages.map((message) =>
        deleteUserMessageAction(scope, message.id),
      ),
    );
    const deletedMessages: ManilaUserMessage[] = [];
    const failedMessages: ManilaUserMessage[] = [];
    const failures: string[] = [];

    results.forEach((result, index) => {
      const message = remainingMessages[index];
      if (!message) return;
      if (result.status === "rejected") {
        failedMessages.push(message);
        failures.push(
          `${message.id}: The deletion request could not be completed.`,
        );
        return;
      }
      if (result.value.ok) {
        deletedMessages.push(message);
        return;
      }

      failedMessages.push(message);
      failures.push(`${message.id}: ${result.value.error.message}`);
    });

    if (deletedMessages.length) {
      await onComplete(deletedMessages);
    }
    setPending(false);

    if (failedMessages.length) {
      setRemainingMessages(failedMessages);
      const shownFailures = failures.slice(0, 3).join(" ");
      const additionalFailures = failures.length - 3;
      setError(
        `${deletedMessages.length} of ${results.length} messages deleted. ${shownFailures}${
          additionalFailures > 0
            ? ` ${additionalFailures} more deletion requests failed.`
            : ""
        }`,
      );
      return;
    }

    onOpenChange();
  };

  const multiple = remainingMessages.length > 1;

  return (
    <MutationConfirmationDialog
      open
      onOpenChange={(open) => !open && !pending && onOpenChange()}
      onConfirm={remove}
      pending={pending}
      title={multiple ? "Delete user messages?" : "Delete user message?"}
      description={`This removes the selected diagnostic record${
        multiple ? "s" : ""
      } only. It does not change affected resources or retry failed operations.`}
      confirmLabel={multiple ? "Delete messages" : "Delete message"}
      pendingLabel={multiple ? "Deleting messages" : "Deleting message"}
      error={error}
      variant="destructive"
    >
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2">
        {remainingMessages.map((message) => (
          <div key={message.id} className="space-y-1 py-1">
            <p className="font-mono text-xs text-muted-foreground">
              {message.id}
            </p>
            <p className="line-clamp-2 text-sm">{message.user_message}</p>
          </div>
        ))}
      </div>
    </MutationConfirmationDialog>
  );
}
