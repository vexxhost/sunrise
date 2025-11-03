"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { LayoutGrid, Server, Container, Database, Globe, FolderTree, MapPin, Layers, FolderKanban, User, LogOut } from "lucide-react"
import type { Project } from "@/types/openstack"
import { useKeystone } from "@/contexts/KeystoneContext"
import { useMediaQuery } from "usehooks-ts"
import { useRegions, useProjects, useProjectToken } from "@/hooks/queries"

import {
  NavigationMenu as _NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

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
]

export function NavigationMenu() {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const { region, setRegion, project, setProject } = useKeystone()

  const { data: regions = [] } = useRegions()
  const { data: projects = [] } = useProjects()
  const { data: tokenData } = useProjectToken()

  return (
    <div className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center justify-between w-full px-6 h-14">
        <_NavigationMenu viewport={isMobile}>
          <NavigationMenuList className="flex items-center gap-3">
            <NavigationMenuItem className="list-none">
              <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                <Image
                  src="/openstack-logo.svg"
                  alt="OpenStack"
                  width={32}
                  height={32}
                  priority
                />
              </Link>
            </NavigationMenuItem>

            <NavigationMenuItem className="list-none">
              <div className="h-6 w-px bg-border" />
            </NavigationMenuItem>

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
        </_NavigationMenu>

        <_NavigationMenu viewport={isMobile}>
          <NavigationMenuList className="flex items-center gap-2">
            {region && regions.length > 0 && (
              <NavigationMenuItem>
                <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono leading-none">{region.id}</span>
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="p-1 min-w-[120px]">
                    {regions.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => setRegion(r)}
                          className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md hover:bg-accent transition-colors whitespace-nowrap ${region.id === r.id ? 'bg-accent font-semibold' : ''
                            }`}
                        >
                          {r.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            )}

            {project && projects.length > 0 && (
              <>
                <NavigationMenuItem className="list-none">
                  <div className="h-6 w-px bg-border" />
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span className="leading-none">{project.name}</span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="p-1 min-w-[200px] max-h-[400px] overflow-y-auto">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => setProject(p)}
                            className={`w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent transition-colors whitespace-nowrap ${project.id === p.id ? 'bg-accent font-semibold' : ''
                              }`}
                          >
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </>
            )}

            {tokenData?.data?.user?.name && (
              <>
                <NavigationMenuItem className="list-none">
                  <div className="h-6 w-px bg-border" />
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="leading-none max-w-[100px] truncate">{tokenData?.data?.user?.name}</span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="right-0 left-auto">
                    <ul className="p-1 min-w-[140px]">
                      <li>
                        <Link
                          href="/auth/logout"
                          className="flex items-center gap-2 w-full text-left p-3 text-xs rounded-md hover:bg-accent transition-colors whitespace-nowrap"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Sign out
                        </Link>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </>
            )}
          </NavigationMenuList>
        </_NavigationMenu>
      </div>
    </div>
  )
}

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
  )
}
