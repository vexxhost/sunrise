"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 group-hover/id:opacity-0 transition-opacity duration-200 shrink-0 cursor-pointer"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
