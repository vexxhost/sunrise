'use client';

import { User, LogOut } from "lucide-react";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

interface UserMenuProps {
  userName?: string | null;
}

export function UserMenu({ userName }: UserMenuProps) {
  if (!userName) {
    return null;
  }

  return (
    <>
      <NavigationMenuItem className="list-none">
        <div className="h-6 w-px bg-border" />
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="leading-none max-w-[100px] truncate">{userName}</span>
        </NavigationMenuTrigger>
        <NavigationMenuContent className="right-0 left-auto">
          <ul className="p-1 min-w-[140px]">
            <li>
              {/*
                Use a plain <a> (not next/link) so logout performs a full page
                navigation. Otherwise the App Router serves the cached RSC for
                "/" rendered before logout, and the user appears still signed in.
              */}
              <a
                href="/auth/logout"
                className="flex items-center gap-2 w-full text-left p-3 text-xs rounded-md hover:bg-accent transition-colors whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </a>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </>
  );
}
