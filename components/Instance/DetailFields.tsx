import type { ReactNode } from "react";
import { FadedText } from "@/components/FadedText";
import { cn } from "@/lib/utils";

interface DetailSectionProps {
  title: string;
  children: ReactNode;
}

interface DetailFieldProps {
  label: string;
  children?: ReactNode;
  className?: string;
}

export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="overflow-visible rounded-md border">{children}</div>
    </section>
  );
}

export function DetailField({ label, children, className }: DetailFieldProps) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <div className="min-w-0 text-muted-foreground">
        <FadedText value={label} />
      </div>
      <div className={cn("min-w-0 break-words [overflow-wrap:anywhere]", className)}>
        {children ?? "-"}
      </div>
    </div>
  );
}
