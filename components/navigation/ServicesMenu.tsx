'use client';

import { LayoutGrid, Server, Container, Database, Globe, FolderTree, Layers } from "lucide-react";
import Link from "next/link";
import { useMediaQuery } from "usehooks-ts";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuList,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

const services: { title: string; href: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    title: "Compute",
    href: "/compute/instances",
    description: "Virtual machines, networks, and storage volumes.",
    icon: Server,
  },
  {
    title: "Kubernetes",
    href: "/kubernetes",
    description: "Deploy and manage orchestration clusters.",
    icon: Container,
  },
  {
    title: "Object Storage",
    href: "/object-storage",
    description: "S3-compatible storage for files and objects.",
    icon: Database,
  },
  {
    title: "Orchestration",
    href: "/orchestration",
    description: "Template-based infrastructure deployment.",
    icon: Layers,
  },
  {
    title: "DNS",
    href: "/dns",
    description: "Manage DNS zones and domain records.",
    icon: Globe,
  },
  {
    title: "File System",
    href: "/file-system",
    description: "Shared file system storage and shares.",
    icon: FolderTree,
  },
];

function ServiceItem({
  title,
  children,
  href,
  icon: Icon,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <li {...props} className="h-full">
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className="group flex flex-col h-full p-4 rounded-lg border border-border/40 bg-card hover:bg-accent hover:border-border transition-all duration-200 hover:shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-semibold text-sm">{title}</div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

export function ServicesMenu() {
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <NavigationMenu viewport={isMobile}>
      <NavigationMenuList className="flex items-center gap-3">
        <NavigationMenuItem>
          <NavigationMenuTrigger className="p-0 px-3 flex items-center justify-center hover:bg-accent">
            <LayoutGrid className="h-5 w-5" />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="p-6 w-[500px]">
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-1">Services</h3>
                <p className="text-sm text-muted-foreground">Access your OpenStack services</p>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {services.map((service) => (
                  <ServiceItem
                    key={service.title}
                    title={service.title}
                    href={service.href}
                    icon={service.icon}
                  >
                    {service.description}
                  </ServiceItem>
                ))}
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
