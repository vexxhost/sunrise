import { getOsIcon } from "@/lib/icons/os-icons";
import { cn } from "@/lib/utils";

interface OsIconProps {
  className?: string;
  decorative?: boolean;
  size?: number;
  slug?: string;
  title?: string;
}

export function OsIcon({
  className,
  decorative = false,
  size = 16,
  slug,
  title,
}: OsIconProps) {
  const entry = getOsIcon(slug);
  const label = title ?? entry.icon.title;
  const viewBox = entry.kind === "custom" ? entry.icon.viewBox ?? "0 0 24 24" : "0 0 24 24";

  return (
    <svg
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      className={cn("shrink-0", className)}
      fill="currentColor"
      height={size}
      role={decorative ? undefined : "img"}
      viewBox={viewBox}
      width={size}
    >
      <path d={entry.icon.path} />
    </svg>
  );
}
