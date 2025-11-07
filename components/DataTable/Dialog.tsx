import { Settings } from "lucide-react";
import { Button } from "../ui/button";

interface DataTableDialogButtonProps {
  disabled?: boolean;
}

export function DataTableDialogButton({ disabled }: DataTableDialogButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-10 px-3 cursor-pointer"
      disabled={disabled}
    >
      <Settings className="h-4 w-4" />
    </Button>
  );
}
