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
import { CloudContextControls } from "./CloudContextControls";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";

export function NavigationMenu() {
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

          <ServicesMenu />
        </div>

        <div className="hidden min-w-0 flex-1 justify-center px-2 lg:flex">
          <GlobalCommandPalette />
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

            <CloudContextControls />
            <UserMenu />
          </NavigationMenuList>
        </_NavigationMenu>
      </div>
    </div>
  );
}
