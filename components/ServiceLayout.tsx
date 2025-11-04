"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar";

export interface SidebarItem {
  name: string;
  href: string;
  icon?: string;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface ServiceLayoutProps {
  children: React.ReactNode;
  sidebarSections: SidebarSection[];
}

export function ServiceLayout({ children, sidebarSections }: ServiceLayoutProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="sticky top-14 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3 px-4 h-12">
          <SidebarTrigger />
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar className="top-[6.5rem]">
          <SidebarContent>
            {sidebarSections.map((section, sectionIndex) => (
              <SidebarGroup key={sectionIndex}>
                {section.title && <SidebarGroupLabel>{section.title}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                      const Icon = item.icon ? (Icons as any)[item.icon] : null;

                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={isActive}>
                            <Link href={item.href}>
                              {Icon && <Icon />}
                              <span>{item.name}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <div className="p-6">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
