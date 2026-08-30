import { cn } from "@/lib/utils";

type SunriseBrandProps = {
  className?: string;
  compact?: boolean;
};

export function SunriseBrand({
  className,
  compact = false,
}: SunriseBrandProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className={cn("shrink-0", compact ? "size-8" : "size-10")}
      >
        <path d="M15 27a9 9 0 0 1 18 0H15Z" fill="#fb7185" />
        <path
          d="M7 29h34"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3.5"
        />
        <path
          d="M12 36h24"
          fill="none"
          stroke="#38bdf8"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      <span
        className={cn(
          "font-semibold text-current",
          compact ? "sr-only" : "text-2xl",
        )}
      >
        Sunrise
      </span>
    </span>
  );
}
