import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type MutationAlertProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: "error" | "success" | "warning";
};

export function MutationAlert({
  children,
  className,
  title,
  variant = "error",
}: MutationAlertProps) {
  const Icon =
    variant === "success"
      ? CircleCheck
      : variant === "warning"
        ? TriangleAlert
        : CircleAlert;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        variant === "error" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        variant === "warning" &&
          "border-yellow-500/40 bg-yellow-500/10 text-foreground",
        variant === "success" &&
          "border-emerald-500/40 bg-emerald-500/10 text-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <div className="font-medium">{title}</div> : null}
        <div className={cn(title && "mt-0.5", "break-words")}>{children}</div>
      </div>
    </div>
  );
}
