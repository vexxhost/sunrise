import type { ReactElement, ReactNode } from "react";
import {
  ResourceLink,
  ResourceLinkButton,
} from "@/components/resources/ResourceLink";

type ResourceNameCellProps = { value: string } & (
  | { href: string; renderTrigger?: never }
  | { href?: never; renderTrigger: (trigger: ReactElement) => ReactNode }
);

export function ResourceNameCell({
  href,
  renderTrigger,
  value,
}: ResourceNameCellProps) {
  const className = "block w-fit min-w-0 max-w-64";
  const name = (
    <span className="block truncate" title={value}>
      {value}
    </span>
  );
  if (renderTrigger) {
    return renderTrigger(
      <ResourceLinkButton className={className}>{name}</ResourceLinkButton>,
    );
  }
  return (
    <ResourceLink href={href} prefetch={false} className={className}>
      {name}
    </ResourceLink>
  );
}
