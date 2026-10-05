"use client";

import Link from "next/link";
import {
  ChevronRight,
  FolderKanban,
  IdCard,
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
} from "lucide-react";
import { useCloudContext } from "@/components/cloud/CloudContext";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const { user, project, role, objectStorage } = useCloudContext();
  const userName = user.name;
  if (!userName) {
    return null;
  }
  const openStackRoleNames = user.roles
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right));
  const openStackRoleCountLabel = `${openStackRoleNames.length} effective ${
    openStackRoleNames.length === 1 ? "role" : "roles"
  }`;

  const roleStatus =
    role.status === "active"
      ? "Active"
      : role.status === "authentication-required"
        ? "Sign-in required"
        : "Not available";

  return (
    <>
      <NavigationMenuItem className="hidden list-none lg:block">
        <div className="h-6 w-px bg-border" />
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuTrigger
          className="h-9 w-11 gap-0 bg-muted/50 px-2 text-xs hover:bg-muted data-[state=open]:bg-muted"
          aria-label={userName}
          title={userName}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
        </NavigationMenuTrigger>
        <NavigationMenuContent className="right-0 left-auto">
          <div className="w-80 max-w-[calc(100vw-2rem)] p-2">
            <div className="border-b px-2 pb-3 pt-1">
              <p className="truncate text-sm font-medium" title={userName}>
                {userName}
              </p>
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex items-start gap-2">
                  <FolderKanban
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Project</p>
                    <p className="truncate" title={project.name}>
                      {project.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground">OpenStack access</p>
                    <p>Project scoped</p>
                    {openStackRoleNames.length > 0 ? (
                      <details className="group mt-1">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            className="size-3 shrink-0 transition-transform group-open:rotate-90"
                            aria-hidden="true"
                          />
                          <span>{openStackRoleCountLabel}</span>
                        </summary>
                        <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto overscroll-contain border-l pl-3 pr-1 text-foreground">
                          {openStackRoleNames.map((roleName) => (
                            <li
                              key={roleName}
                              className="truncate"
                              title={roleName}
                            >
                              {roleName}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        No effective roles reported
                      </p>
                    )}
                  </div>
                </div>
                {objectStorage.backend === "s3" ? (
                  <div
                    className="flex items-start gap-2"
                    title={role.arn ?? role.message}
                  >
                    <KeyRound
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground">RGW IAM role</p>
                      <p className="block truncate">
                        {role.name ?? "Not mapped"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            role.status === "active"
                              ? "bg-status-success"
                              : role.status === "authentication-required"
                                ? "bg-status-warning"
                                : "bg-muted-foreground/50",
                          )}
                          aria-hidden="true"
                        />
                        {roleStatus}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <ul className="pt-1">
              <li>
                <Link
                  href="/identity"
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors hover:bg-accent"
                >
                  <IdCard className="h-3.5 w-3.5" />
                  Identity
                </Link>
              </li>
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
