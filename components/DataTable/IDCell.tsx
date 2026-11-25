"use client";

import type { ReactElement, ReactNode } from "react";
import {
  ResourceLink,
  ResourceLinkButton,
} from "@/components/resources/ResourceLink";
import { CopyButton } from "@/components/ui/copy-button";

type IDCellProps = { value: string; copyLabel?: string } & (
  | { href?: string; renderTrigger?: never }
  | { href?: never; renderTrigger: (trigger: ReactElement) => ReactNode }
);

export function IDCell({
  value,
  href,
  renderTrigger,
  copyLabel = "Copy ID",
}: IDCellProps) {
  const triggerClassName = "min-w-0 flex-1 font-normal";
  const text = <span className="block truncate">{value}</span>;
  return (
    <div className="flex w-28 items-center gap-1 font-mono text-sm">
      {renderTrigger ? (
        renderTrigger(
          <ResourceLinkButton className={triggerClassName} title={value}>
            {text}
          </ResourceLinkButton>,
        )
      ) : href ? (
        <ResourceLink
          className={triggerClassName}
          href={href}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
          title={value}
        >
          {text}
        </ResourceLink>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={value}>
          {value}
        </span>
      )}
      <CopyButton
        value={value}
        label={copyLabel}
        size="icon-xs"
        className="shrink-0 text-muted-foreground"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
