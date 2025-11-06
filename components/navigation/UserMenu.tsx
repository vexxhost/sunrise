'use client';

import { User, LogOut } from "lucide-react";
import { useProjectToken } from "@/hooks/queries";
import Link from "next/link";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function UserMenu() {
  const { data: tokenData } = useProjectToken();

  if (!tokenData?.data?.user?.name) {
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
  );
}
