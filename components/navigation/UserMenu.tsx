"use client";

import { FolderKanban, KeyRound, LogOut, User } from "lucide-react";
import { useCloudContext } from "@/components/cloud/CloudContext";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const { user, project, role } = useCloudContext();
  const userName = user.name;
  if (!userName) {
    return null;
  }

  const roleStatus =
    role.status === "active"
      ? "Active"
      : role.status === "authentication-required"
        ? "Sign-in required"
        : "Not available";

  return (
    <>
      <NavigationMenuItem className="hidden list-none sm:block">
        <div className="h-6 w-px bg-border" />
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuTrigger
          className="h-9 gap-2 bg-muted/50 px-2.5 text-xs hover:bg-muted data-[state=open]:bg-muted sm:px-3"
          aria-label={userName}
          title={userName}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden max-w-[100px] truncate leading-none sm:inline">
            {userName}
          </span>
        </NavigationMenuTrigger>
        <NavigationMenuContent className="right-0 left-auto">
          <div className="w-72 p-2">
            <div className="border-b px-2 pb-3 pt-1">
              <p className="truncate text-sm font-medium" title={userName}>
                {userName}
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <FolderKanban
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <dt className="sr-only">Project</dt>
                  <dd className="min-w-0 truncate" title={project.name}>
                    {project.name}
                  </dd>
                </div>
                <div
                  className="flex items-start gap-2"
                  title={role.arn ?? role.message}
                >
                  <KeyRound
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <dt className="sr-only">Object Storage role</dt>
                  <dd className="min-w-0 flex-1">
                    <span className="block truncate">
                      {role.name ?? "Object Storage role"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          role.status === "active"
                            ? "bg-emerald-500"
                            : role.status === "authentication-required"
                              ? "bg-amber-500"
                              : "bg-muted-foreground/50",
                        )}
                        aria-hidden="true"
                      />
                      {roleStatus}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            <ul className="pt-1">
            <li>
              {/*
                Use a plain <a> (not next/link) so logout performs a full page
                navigation. Otherwise the App Router serves the cached RSC for
                "/" rendered before logout, and the user appears still signed in.
              */}
              <a
                href="/auth/logout"
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </a>
            </li>
          </ul>
          </div>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </>
  );
}
