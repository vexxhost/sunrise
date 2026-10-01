import { LogOut, RefreshCw, UserRound } from "lucide-react";
import { AuthScene } from "@/components/Auth/AuthScene";
import type { AuthRecoveryReason, SunriseIdentity } from "@/lib/session";

const recoveryContent: Record<
  AuthRecoveryReason,
  { eyebrow: string; title: string; description: string }
> = {
  "no-projects": {
    eyebrow: "Cloud access unavailable",
    title: "No projects are assigned",
    description:
      "This account signed in successfully, but it does not have access to an OpenStack project.",
  },
  "no-role": {
    eyebrow: "Cloud access unavailable",
    title: "No usable project role",
    description:
      "This account can discover a project, but OpenStack did not issue a project-scoped role for it.",
  },
  "federation-failed": {
    eyebrow: "Federation interrupted",
    title: "Cloud sign-in could not be completed",
    description:
      "Your identity provider accepted this account, but OpenStack could not establish its federated session.",
  },
  "access-denied": {
    eyebrow: "Cloud access denied",
    title: "OpenStack rejected this account",
    description:
      "Your identity is valid, but it is not allowed to discover the projects or regions required by Sunrise.",
  },
  "session-unavailable": {
    eyebrow: "Connection interrupted",
    title: "Cloud session unavailable",
    description:
      "Sunrise could not verify the OpenStack session. You can safely sign out or continue with another account.",
  },
};

export function AuthRecovery({
  identity,
  reason,
}: {
  identity?: SunriseIdentity;
  reason: AuthRecoveryReason;
}) {
  const content = recoveryContent[reason];
  const secondaryIdentity =
    identity?.email && identity.email !== identity.displayName
      ? identity.email
      : identity?.preferredUsername !== identity?.displayName
        ? identity?.preferredUsername
        : undefined;

  return (
    <AuthScene>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-status-warning">
          {content.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          {content.title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {content.description}
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-md border border-border bg-muted/55 p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
            <UserRound className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium text-foreground">
              {identity?.displayName ?? "Signed-in account"}
            </p>
            {secondaryIdentity ? (
              <p className="truncate text-xs text-muted-foreground">
                {secondaryIdentity}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <a
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-control)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/auth/logout?mode=switch"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Switch account
          </a>
          <a
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href="/auth/logout"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </a>
        </div>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Ask your cloud administrator to review project membership and role
          assignments if this account should have access.
        </p>
      </div>
    </AuthScene>
  );
}
