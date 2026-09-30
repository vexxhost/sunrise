"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Clock3, LoaderCircle, LogIn } from "lucide-react";
import { login } from "@/app/(main)/auth/login/action";
import { AuthScene } from "@/components/Auth/AuthScene";
import type { SessionExpiryReason } from "@/lib/session-lifetime";

const expiryNotice: Record<SessionExpiryReason, string> = {
  idle: "Your previous session expired after a period without activity.",
  absolute: "Your previous session reached its maximum lifetime.",
  policy:
    "Your previous session ended so the current security policy could be applied.",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      type="submit"
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-control)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <LogIn className="size-4" />
      )}
      {pending ? "Connecting..." : "Continue"}
    </button>
  );
}

export default function Login({
  authorizationPrompt,
  sessionExpiryReason,
}: {
  authorizationPrompt?: "login" | "select_account";
  sessionExpiryReason?: SessionExpiryReason;
}) {
  const [state, action] = useActionState(login, undefined);

  return (
    <AuthScene>
      <div>
        <p className="text-center text-sm font-medium text-status-info">
          Cloud console
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold text-foreground sm:text-4xl">
          Welcome back
        </h1>
        <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
          Sign in to continue.
        </p>

        {sessionExpiryReason ? (
          <div className="mt-6 flex gap-3 rounded-md border border-status-warning-border bg-status-warning-soft p-3 text-sm leading-5 text-status-warning">
            <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{expiryNotice[sessionExpiryReason]} Sign in to continue.</p>
          </div>
        ) : null}

        <form action={action} className="mt-9 space-y-5">
          {authorizationPrompt ? (
            <input
              type="hidden"
              name="authorization_prompt"
              value={authorizationPrompt}
            />
          ) : null}
          <div>
            <label
              htmlFor="id_provider"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Identity provider
            </label>
            <input
              id="id_provider"
              name="id_provider"
              type="text"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-11 w-full rounded-md border border-input bg-background/70 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 dark:bg-white/5"
              placeholder="Enter your provider ID"
            />

            {state?.errors?.idProvider && (
              <p
                className="mt-2 text-sm text-status-danger"
                role="alert"
              >
                {state.errors.idProvider.join(" ")}
              </p>
            )}
          </div>

          <SubmitButton />
        </form>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          You will be redirected to your identity provider to complete sign-in.
        </p>
      </div>
    </AuthScene>
  );
}
