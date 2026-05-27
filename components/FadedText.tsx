import { cn } from "@/lib/utils";

interface FadedTextProps {
  value?: string | null;
  className?: string;
  spacerLength?: number;
}

export function FadedText({
  value,
  className,
  spacerLength = 16,
}: FadedTextProps) {
  const displayValue = value || "-";
  const spacerValue = displayValue.slice(0, spacerLength) || displayValue;

  return (
    <span
      className={cn(
        "group/faded-text relative block w-full min-w-0 flex-shrink-0",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 z-10 block w-full overflow-hidden whitespace-nowrap",
          "[mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)]",
          "group-hover/faded-text:left-[-9px] group-hover/faded-text:top-[-5px] group-hover/faded-text:z-50 group-hover/faded-text:w-auto group-hover/faded-text:max-w-[min(80vw,48rem)]",
          "group-hover/faded-text:overflow-visible group-hover/faded-text:rounded-md group-hover/faded-text:border group-hover/faded-text:border-border group-hover/faded-text:bg-popover",
          "group-hover/faded-text:px-2 group-hover/faded-text:py-1 group-hover/faded-text:text-popover-foreground group-hover/faded-text:underline",
          "group-hover/faded-text:[mask-image:none] group-hover/faded-text:[-webkit-mask-image:none]",
        )}
      >
        {displayValue}
      </span>
      <span className="invisible block whitespace-nowrap">{spacerValue}</span>
    </span>
  );
}
