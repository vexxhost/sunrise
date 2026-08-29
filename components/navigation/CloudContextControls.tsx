"use client";

import { useCloudContext } from "@/components/cloud/CloudContext";
import { NavigationMenuItem } from "@/components/ui/navigation-menu";
import { ProjectSelector } from "./ProjectSelector";
import { RegionSelector } from "./RegionSelector";

export function CloudContextControls() {
  const { project, region } = useCloudContext();
  const hasRegion = region.status === "selected";
  const hasProject = project.status === "selected";

  return (
    <>
      {hasRegion ? (
        <NavigationMenuItem>
          <RegionSelector />
        </NavigationMenuItem>
      ) : null}

      {hasProject ? (
        <>
          <NavigationMenuItem className="hidden list-none sm:block">
            <div className="h-6 w-px bg-border" />
          </NavigationMenuItem>
          <NavigationMenuItem>
            <ProjectSelector />
          </NavigationMenuItem>
        </>
      ) : null}
    </>
  );
}
