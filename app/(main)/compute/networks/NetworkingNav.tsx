"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const views = [
  { href: "/compute/networks", label: "Topology" },
  { href: "/compute/networks/resources", label: "Networks" },
  { href: "/compute/networks/routers", label: "Routers" },
  { href: "/compute/networks/ports", label: "Ports" },
  { href: "/compute/networks/floating-ips", label: "Floating IPs" },
  { href: "/compute/networks/security-groups", label: "Security groups" },
] as const;

export function NetworkingNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Networking views"
      className="mb-4 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max gap-6">
        {views.map((view) => {
          const active =
            pathname === view.href ||
            (view.href !== "/compute/networks" &&
              pathname.startsWith(`${view.href}/`));
          return (
            <Link
              key={view.href}
              href={view.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground",
                active && "font-medium text-foreground",
              )}
            >
              {view.label}
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
