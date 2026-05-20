import { Settings } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export const DataTableDialogButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, disabled, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="sm"
      aria-label="Table settings"
      title="Table settings"
      className={cn("h-10 px-3 cursor-pointer", className)}
      disabled={disabled}
      {...props}
    >
      <Settings className="h-4 w-4" />
    </Button>
  );
});

DataTableDialogButton.displayName = "DataTableDialogButton";
