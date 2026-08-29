"use client";

import { useState, type ComponentType } from "react";
import {
  ChevronRight,
  Container,
  Database,
  FolderTree,
  Globe,
  Layers,
  LayoutGrid,
  Search,
  Server,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "usehooks-ts";
import { useCloudContext } from "@/components/cloud/CloudContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openGlobalSearch } from "@/components/navigation/global-search-events";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuList,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import type {
  ServiceDirectoryId,
  ServiceDirectoryItem,
} from "@/lib/openstack/service-directory";
import { cn } from "@/lib/utils";

const serviceIcons: Record<
  ServiceDirectoryId,
  ComponentType<{ className?: string }>
> = {
  compute: Server,
  kubernetes: Container,
  "object-storage": Database,
  orchestration: Layers,
  dns: Globe,
  "file-system": FolderTree,
};

const servicePathPrefixes: Record<ServiceDirectoryId, string> = {
  compute: "/compute",
  kubernetes: "/kubernetes",
  "object-storage": "/object-storage",
  orchestration: "/orchestration",
  dns: "/dns",
  "file-system": "/file-system",
};

function ServiceItem({
  service,
  active,
}: {
  service: ServiceDirectoryItem;
  active: boolean;
}) {
  const Icon = serviceIcons[service.id];
  const unavailable = service.status === "unavailable";
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
          active && !unavailable && "border-primary/40 text-primary",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {service.label}
          </span>
          {unavailable ? (
            <Badge variant="outline" className="text-muted-foreground">
              Unavailable
            </Badge>
          ) : active ? (
            <Badge variant="secondary">Current</Badge>
          ) : service.status === "unknown" ? (
            <Badge variant="outline" className="text-muted-foreground">
              Unknown
            </Badge>
          ) : (
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {service.description}
        </span>
      </span>
    </>
  );

  if (unavailable) {
    return (
      <li>
        <div
          className="flex min-h-20 items-start gap-3 rounded-md p-3 opacity-60"
          aria-disabled="true"
          title={service.message}
        >
          {content}
        </div>
      </li>
    );
  }

  return (
    <li>
      <NavigationMenuLink asChild active={active}>
        <Link
          href={service.href}
          className="flex min-h-20 flex-row items-start gap-3 rounded-md p-3"
          title={service.message}
        >
          {content}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

export function ServicesMenu() {
  const { services } = useCloudContext();
  const pathname = usePathname();
  const [value, setValue] = useState("");
  const isMobile = useMediaQuery("(max-width: 767px)", {
    initializeWithValue: false,
  });
  const availableCount = services.filter(
    ({ status }) => status === "available",
  ).length;
  const availabilityKnown = services.every(
    ({ status }) => status !== "unknown",
  );

  return (
    <NavigationMenu viewport={isMobile} value={value} onValueChange={setValue}>
      <NavigationMenuList className="flex items-center gap-1 sm:gap-3">
        <NavigationMenuItem value="services">
          <NavigationMenuTrigger
            className="flex items-center justify-center px-2 hover:bg-accent sm:px-3"
            aria-label="Services"
            title="Services"
          >
            <LayoutGrid className="size-5" aria-hidden="true" />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-[calc(100vw-5.5rem)] max-w-[34rem] p-3 sm:w-[34rem] sm:p-4">
              <Button
                type="button"
                variant="outline"
                className="mb-3 w-full justify-start text-muted-foreground"
                onClick={() => {
                  setValue("");
                  window.setTimeout(openGlobalSearch, 0);
                }}
              >
                <Search className="size-4" aria-hidden="true" />
                <span>Search Sunrise</span>
                <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </Button>
              <div className="mb-2 flex items-center justify-between gap-3 px-2">
                <div>
                  <h2 className="text-sm font-semibold">Services</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    OpenStack services in the active region
                  </p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  {availabilityKnown
                    ? `${availableCount} of ${services.length} available`
                    : "Availability unknown"}
                </Badge>
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {services.map((service) => (
                  <ServiceItem
                    key={service.id}
                    service={service}
                    active={pathname.startsWith(servicePathPrefixes[service.id])}
                  />
                ))}
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
