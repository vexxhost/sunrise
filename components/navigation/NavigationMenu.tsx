import Link from "next/link";
import Image from "next/image";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu as _NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { ServicesMenu } from "./ServicesMenu";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { RegionSelector } from "./RegionSelector";
import { ProjectSelector } from "./ProjectSelector";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";
import { getRegions, getProjects } from "@/lib/keystone/queries";
import { getSession } from "@/lib/session";
import { getUserInfo } from "@/lib/openstack/keystone-actions";
import { getServiceCatalog } from "@/lib/openstack/catalog";
import { buildServiceDirectory } from "@/lib/openstack/service-directory";
import { readPrefs } from "@/lib/prefs";
import { visibleResourcePreferences } from "@/lib/resource-preferences";

export async function NavigationMenu() {
  // Get session to read selected region/project IDs
  const session = await getSession();

  // Fetch regions and selected region
  const regions = await getRegions();
  const selectedRegion = regions.length > 0
    ? (regions.find(r => r.id === session.regionId) || regions[0])
    : null;

  // Fetch projects and selected project
  const projects = await getProjects();
  const selectedProject = projects.length > 0
    ? (projects.find(p => p.id === session.projectId) || projects[0])
    : null;

  // Region/project discovery can initialize session defaults. Re-read the
  // session before using its scoped token so the service switcher reflects the
  // same active context as the selectors.
  const activeSession = await getSession();
  const [userInfo, catalog, prefs] = await Promise.all([
    getUserInfo(),
    activeSession.keystoneProjectToken
      ? getServiceCatalog(activeSession.keystoneProjectToken)
      : Promise.resolve(null),
    readPrefs(),
  ]);
  const regionId = selectedRegion?.id ?? activeSession.regionId;
  const projectId = selectedProject?.id ?? activeSession.projectId;
  const services = buildServiceDirectory(
    catalog,
    regionId,
  );
  const personalResources = visibleResourcePreferences({
    recent: prefs.recentResources ?? [],
    pinned: prefs.pinnedResources ?? [],
    context: {
      projectId: projectId ?? "",
      regionId: regionId ?? "",
    },
  });

  return (
    <div className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 sm:px-6">
        {/* Left side: Logo + Services Menu */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Image
              src="/openstack-logo.svg"
              alt="OpenStack"
              width={37}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>

          <div className="h-6 w-px bg-border" />

          <ServicesMenu services={services} />
        </div>

        <div className="hidden min-w-0 flex-1 justify-center px-2 lg:flex">
          <GlobalCommandPalette
            key={`${regionId ?? "none"}:${projectId ?? "none"}`}
            services={services}
            pinnedResources={personalResources.pinned}
            recentResources={personalResources.recent}
            regionId={regionId}
            projectId={projectId}
          />
        </div>

        {/* Right side: Feedback + Region + Project + User */}
        <_NavigationMenu
          viewport={false}
          delayDuration={600}
          skipDelayDuration={0}
          className="shrink-0"
        >
          <NavigationMenuList className="flex items-center gap-2">
            <NavigationMenuItem className="hidden list-none lg:block">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-2 text-xs h-9 px-3 hover:bg-muted"
              >
                <a
                  href="https://github.com/vexxhost/sunrise/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Feedback
                </a>
              </Button>
            </NavigationMenuItem>

            <NavigationMenuItem className="list-none">
              <ThemeToggle />
            </NavigationMenuItem>

            {selectedRegion && (
              <NavigationMenuItem>
                <RegionSelector
                  regions={regions}
                  selectedRegion={selectedRegion}
                />
              </NavigationMenuItem>
            )}

            {selectedProject && (
              <>
                <NavigationMenuItem className="hidden list-none sm:block">
                  <div className="h-6 w-px bg-border" />
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <ProjectSelector
                    projects={projects}
                    selectedProject={selectedProject}
                  />
                </NavigationMenuItem>
              </>
            )}

            <UserMenu userName={userInfo?.name} />
          </NavigationMenuList>
        </_NavigationMenu>
      </div>
    </div>
  );
}
