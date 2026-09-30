import { cn } from "@/lib/utils";

interface ProgressStatusBadgeProps {
  className?: string;
  label: string;
  title?: string;
}

export function ProgressStatusBadge({
  className,
  label,
  title,
}: ProgressStatusBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`${label}; operation in progress`}
      title={title}
      data-slot="badge"
      className={cn(
        "relative isolate inline-flex w-fit shrink-0 items-center justify-center overflow-visible whitespace-nowrap rounded-full bg-transparent px-2 py-0.5 text-xs font-medium text-status-info ring-1 ring-inset ring-status-info-border",
        className,
      )}
    >
      <span className="absolute inset-[2px] z-0 rounded-full bg-status-info-soft" />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-[-1px] z-10 h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible text-status-info"
        preserveAspectRatio="none"
        viewBox="0 0 100 24"
      >
        <rect
          x="1"
          y="1"
          width="98"
          height="22"
          rx="11"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        <rect
          x="1"
          y="1"
          width="98"
          height="22"
          rx="11"
          fill="none"
          pathLength="100"
          stroke="currentColor"
          strokeDasharray="22 78"
          strokeLinecap="round"
          strokeWidth="2.5"
          className="motion-reduce:hidden"
        >
          <animate
            attributeName="stroke-dashoffset"
            dur="1.2s"
            from="100"
            repeatCount="indefinite"
            to="0"
          />
        </rect>
      </svg>
      <span className="relative z-20 px-0.5">{label}</span>
    </span>
  );
}
