import { Settings } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/button";

export const DataTableDialogButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, disabled, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon-lg"
      aria-label="Table settings"
      title="Table settings"
      className={className}
      disabled={disabled}
      {...props}
    >
      <Settings className="h-4 w-4" />
    </Button>
  );
});

DataTableDialogButton.displayName = "DataTableDialogButton";
