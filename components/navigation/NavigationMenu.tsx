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
import { RegionSelector } from "./RegionSelector";
import { ProjectSelector } from "./ProjectSelector";
import { UserMenu } from "./UserMenu";

export function NavigationMenu() {
  return (
    <div className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center justify-between w-full px-6 h-14">
        {/* Left side: Logo + Services Menu */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Image
              src="/openstack-logo.svg"
              alt="OpenStack"
              width={32}
              height={32}
              priority
            />
          </Link>

          <div className="h-6 w-px bg-border" />

          <ServicesMenu />
        </div>

        {/* Right side: Feedback + Region + Project + User */}
        <_NavigationMenu>
          <NavigationMenuList className="flex items-center gap-2">
            <NavigationMenuItem className="list-none">
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

            <RegionSelector />
            <ProjectSelector />
            <UserMenu />
          </NavigationMenuList>
        </_NavigationMenu>
      </div>
    </div>
  );
}
