"use client";

import Link from "next/link";
import { CopyButton } from "@/components/ui/copy-button";

interface IDCellProps {
  value: string;
  isSelected: boolean;
  linkPath?: string;
}

/**
 * ID Cell Component with copy functionality and hover expand
 * Shows truncated ID with gradient fade, expands on hover to show full ID
 */
export function IDCell({ value, isSelected, linkPath }: IDCellProps) {
  const content = (
    <div className="relative w-[100px] flex-shrink-0 group/id">
      <div className="absolute left-0 top-0 w-full overflow-hidden group-hover/id:left-[-9px] group-hover/id:top-[-5px] group-hover/id:z-50 group-hover/id:w-auto group-hover/id:px-2 group-hover/id:py-1 group-hover/id:bg-popover group-hover/id:text-popover-foreground group-hover/id:border group-hover/id:border-border group-hover/id:rounded-md group-hover/id:overflow-visible group-hover/id:underline">
        <span className="font-mono text-sm tracking-tighter block whitespace-nowrap relative z-10">
          {value}
        </span>
      </div>
      {/* Gradient fade - visible when not hovering */}
      <div
        className={`absolute inset-y-0 right-0 w-12 pointer-events-none opacity-100 group-hover/id:opacity-0 z-20 ${
          isSelected
            ? "bg-gradient-to-l from-muted to-transparent"
            : "bg-gradient-to-l from-background to-transparent group-hover/row:from-muted/50"
        }`}
      />
      {/* Invisible spacer to maintain height */}
      <span className="font-mono text-sm tracking-tighter block whitespace-nowrap invisible">
        {value.substring(0, 10)}
      </span>
    </div>
  );

  return (
    <div className="flex items-center gap-1 group">
      {linkPath ? (
        <Link href={`${linkPath}/${value}`} onClick={(e) => e.stopPropagation()}>
          {content}
        </Link>
      ) : (
        content
      )}
      <CopyButton
        value={value}
        label="Copy ID"
        size="icon-xs"
        className="opacity-0 group-hover:opacity-100 group-hover/id:opacity-0 transition-opacity duration-200 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    </div>
  );
}
