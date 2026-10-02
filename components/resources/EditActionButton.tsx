"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type EditActionButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "size" | "variant"
> & {
  compact?: boolean;
  label?: string;
};

export function EditActionButton({
  compact = false,
  label = "Edit",
  ...props
}: EditActionButtonProps) {
  const button = (
    <Button
      {...props}
      aria-label={props["aria-label"] ?? label}
      size={compact ? "icon-sm" : "default"}
      variant={compact ? "ghost" : "outline"}
    >
      <Pencil className="size-4" aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : "Edit"}
    </Button>
  );

  if (!compact) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
