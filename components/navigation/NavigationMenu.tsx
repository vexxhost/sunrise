import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { SunriseBrand } from "@/components/Brand/SunriseBrand";
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
    <div className="sticky top-0 z-50 w-full border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="grid h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,27rem)_minmax(0,1fr)]">
        {/* Left side: Logo + Services Menu */}
        <div className="flex min-w-0 items-center gap-1 justify-self-start sm:gap-3">
          <Link
            href="/"
            aria-label="Sunrise overview"
            className="flex items-center transition-opacity hover:opacity-80 max-[383px]:hidden"
          >
            <SunriseBrand compact />
          </Link>

          <div className="hidden h-6 w-px bg-border sm:block" />

          <ServicesMenu />
        </div>

        <div className="flex min-w-0 justify-center px-1 xl:w-full xl:px-2">
          <GlobalCommandPalette />
        </div>

        {/* Right side: Feedback + Region + Project + User */}
        <_NavigationMenu
          viewport={false}
          delayDuration={600}
          skipDelayDuration={0}
          className="min-w-0 shrink-0 justify-self-end"
        >
          <NavigationMenuList className="flex items-center gap-1 lg:gap-2">
            <NavigationMenuItem className="hidden list-none min-[1600px]:block">
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
