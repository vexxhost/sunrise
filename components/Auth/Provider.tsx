import Login from "@/components/Auth/Login";
import { AuthScene } from "@/components/Auth/AuthScene";
import { getKeystoneSessionState } from "@/lib/keystone/session";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

function SessionUnavailable({ reason }: { reason: string }) {
  return (
    <AuthScene>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
          Connection interrupted
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Session unavailable
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Sunrise could not validate the Keystone session. Sign in again to
          continue.
        </p>
        <p className="mt-4 break-words rounded-md border border-border bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          {reason}
        </p>
        <a
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          href="/auth/logout"
        >
          Sign in again
        </a>
      </div>
    </AuthScene>
  );
}

export default async function Provider({ children }: any) {
  const session = await getSession();
  if (!session.keystone_unscoped_token) {
    return <Login />;
  }

  const sessionState = await getKeystoneSessionState(session);
  if (sessionState.status === "missing") {
    return <Login />;
  }

  if (sessionState.status === "invalid") {
    redirect("/auth/logout?reason=expired");
  }

  if (sessionState.status === "unknown") {
    return <SessionUnavailable reason={sessionState.reason} />;
  }

  return <>{children}</>;
}
