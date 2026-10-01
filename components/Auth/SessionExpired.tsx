import { Clock3, LogIn, RefreshCw, UserRound } from "lucide-react";
import { AuthScene } from "@/components/Auth/AuthScene";
import type { SessionExpiryReason } from "@/lib/session-lifetime";
import type { SunriseIdentity } from "@/lib/session";

const expiryContent: Record<
  SessionExpiryReason,
  { title: string; description: string }
> = {
  idle: {
    title: "Your session expired",
    description:
      "Sunrise signed you out after a period without activity. Sign in again to continue.",
  },
  absolute: {
    title: "It is time to sign in again",
    description:
      "Your Sunrise session reached its maximum lifetime. This limit cannot be extended by background refreshes.",
  },
  policy: {
    title: "Please renew your session",
    description:
      "Sign in again to apply the current Sunrise session security policy.",
  },
};

export function SessionExpired({
  identity,
  reason,
}: {
  identity?: SunriseIdentity;
  reason: SessionExpiryReason;
}) {
  const content = expiryContent[reason];
  const account = identity?.preferredUsername ?? identity?.email;

  return (
    <AuthScene>
      <div className="max-w-sm">
        <div className="flex size-10 items-center justify-center rounded-md border border-status-warning-border bg-status-warning-soft text-status-warning">
          <Clock3 className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-foreground">
          {content.title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {content.description}
        </p>

        {account ? (
          <div className="mt-6 flex items-center gap-3 rounded-md border border-border bg-muted/55 p-3">
            <UserRound
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Previous account</p>
              <p className="truncate text-sm font-medium text-foreground">
                {account}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-2">
          <a
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-control)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/auth/logout?reason=${reason}`}
          >
            <LogIn className="size-4" aria-hidden="true" />
            Sign in again
          </a>
          <a
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href={`/auth/logout?reason=${reason}&mode=switch`}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Switch account
          </a>
        </div>
      </div>
    </AuthScene>
  );
}
