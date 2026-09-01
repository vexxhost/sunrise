"use client";

import { Trash2 } from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type MutationConfirmationDialogProps = {
  children?: React.ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  description: React.ReactNode;
  error?: string | null;
  onConfirm: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  pendingLabel?: string;
  title: string;
  variant?: "default" | "destructive";
};

export function MutationConfirmationDialog({
  children,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  description,
  error,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  pendingLabel = "Working",
  title,
  variant = "default",
}: MutationConfirmationDialogProps) {
  const destructive = variant === "destructive";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error ? <MutationAlert>{error}</MutationAlert> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending || confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {pending ? (
              <Spinner />
            ) : destructive ? (
              <Trash2 className="size-4" />
            ) : null}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
