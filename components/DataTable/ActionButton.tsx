import { Button } from "../ui/button";

interface ActionButtonProps {
  label: string;
  variant: "default" | "destructive" | "outline" | "secondary";
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
};

export function ActionButton({ icon: Icon, variant, label, onClick }: ActionButtonProps) {
  return <Button
    size="sm"
    variant={variant}
    onClick={onClick}
    className="gap-2 h-10 cursor-pointer"
  >
    {Icon && <Icon className="h-4 w-4" />}
    {label}
  </Button>;
}
