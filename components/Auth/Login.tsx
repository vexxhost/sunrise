"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, LogIn } from "lucide-react";
import { login } from "@/app/(main)/auth/login/action";
import { AuthScene } from "@/components/Auth/AuthScene";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      type="submit"
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70"
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

export default function Login() {
  const [state, action] = useActionState(login, undefined);

  return (
    <AuthScene>
      <div>
        <p className="text-center text-sm font-medium text-sky-700 dark:text-cyan-200">
          Cloud console
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold text-foreground sm:text-4xl">
          Welcome back
        </h1>
        <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
          Sign in to continue.
        </p>

        <form action={action} className="mt-9 space-y-5">
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
              className="h-11 w-full rounded-md border border-input bg-background/70 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:bg-white/5 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/25"
              placeholder="Enter your provider ID"
            />

            {state?.errors?.idProvider && (
              <p className="mt-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
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
