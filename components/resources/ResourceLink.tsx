import type { ComponentProps } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type ResourceLinkProps = ComponentProps<typeof Link>;

const resourceLinkClassName =
  "rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ResourceLink({ className, ...props }: ResourceLinkProps) {
  return <Link className={cn(resourceLinkClassName, className)} {...props} />;
}

export function ResourceLinkButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        resourceLinkClassName,
        "cursor-pointer text-left",
        className,
      )}
      {...props}
    />
  );
}
