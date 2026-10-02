"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function WizardDialog(props: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

function WizardDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  return <DialogTrigger {...props} />;
}

function WizardDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[calc(100dvh-2rem)] min-h-0 w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl",
        className,
      )}
      {...props}
    />
  );
}

function WizardDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn("shrink-0 border-b px-5 py-4 pr-12", className)}
      {...props}
    />
  );
}

function WizardDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "shrink-0 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function WizardDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}

function WizardDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  return <DialogDescription {...props} />;
}

function WizardReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,0.45fr)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function WizardReviewStatus({ issues }: { issues: string[] }) {
  const complete = issues.length === 0;

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        complete
          ? "border-status-success-border bg-status-success-soft"
          : "border-status-warning-border bg-status-warning-soft",
      )}
    >
      <div className="flex items-start gap-3">
        {complete ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-success" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-warning" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {complete
              ? "Required settings complete"
              : "Resolve before creating"}
          </p>
          {complete ? (
            <p className="mt-1 text-sm text-muted-foreground">
              All required information has been provided.
            </p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export {
  WizardDialog,
  WizardDialogContent,
  WizardDialogDescription,
  WizardDialogFooter,
  WizardDialogHeader,
  WizardDialogTitle,
  WizardDialogTrigger,
  WizardReviewRow,
  WizardReviewStatus,
};
