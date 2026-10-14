"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  KeyRound,
  LoaderCircle,
  LogIn,
} from "lucide-react";
import { login } from "@/app/(main)/auth/login/action";
import { AuthScene } from "@/components/Auth/AuthScene";
import { useCurrentAuthReturnTo } from "@/components/Auth/useCurrentAuthReturnTo";
import { identityProviderSignInPath } from "@/lib/auth-navigation";
import { copyTextToClipboard } from "@/lib/client-clipboard";
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
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogIn className="size-4" aria-hidden="true" />
      )}
      {pending ? "Connecting..." : "Continue"}
    </button>
  );
}

type CopyState = {
  key: "manual" | "remembered";
  status: "copied" | "error";
};

type RememberedIdentityProvider = {
  displayName: string;
  signInSlug: string;
};

function CopySignInLink({
  provider,
  copyState,
  getProvider,
  interactive,
  onCopy,
  compact = false,
  copyKey,
  disableWhenEmpty = true,
}: {
  provider: string;
  copyState?: CopyState;
  getProvider?: () => string;
  interactive: boolean;
  onCopy: (provider: string, key: CopyState["key"]) => void;
  compact?: boolean;
  copyKey: CopyState["key"];
  disableWhenEmpty?: boolean;
}) {
  const trimmedProvider = provider.trim();
  const currentStatus =
    copyState?.key === copyKey ? copyState.status : undefined;
  const label =
    currentStatus === "copied"
      ? "Copied"
      : currentStatus === "error"
        ? "Copy failed"
        : "Copy sign-in link";

  return (
    <button
      type="button"
      disabled={!interactive || (disableWhenEmpty && !trimmedProvider)}
      onClick={() => {
        const resolvedProvider = (getProvider?.() ?? trimmedProvider).trim();
        if (resolvedProvider) onCopy(resolvedProvider, copyKey);
      }}
      className={
        compact
          ? "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          : "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      }
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      {currentStatus === "copied" ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {compact ? null : label}
    </button>
  );
}

export default function Login({
  authorizationPrompt,
  initialReturnTo = "/",
  rememberedProvider,
  returningVisitor = false,
  sessionExpiryReason,
}: {
  authorizationPrompt?: "login" | "select_account";
  initialReturnTo?: string;
  rememberedProvider?: RememberedIdentityProvider;
  returningVisitor?: boolean;
  sessionExpiryReason?: SessionExpiryReason;
}) {
  const [state, action] = useActionState(login, undefined);
  const [provider, setProvider] = useState("");
  const [copyState, setCopyState] = useState<CopyState>();
  const [interactive, setInteractive] = useState(false);
  const [showAlternativeProvider, setShowAlternativeProvider] = useState(false);
  const providerInputRef = useRef<HTMLInputElement>(null);
  const returnTo = useCurrentAuthReturnTo(initialReturnTo);

  useEffect(() => {
    if (!copyState) return;
    const timeout = window.setTimeout(() => setCopyState(undefined), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  useEffect(() => {
    const currentProvider = providerInputRef.current?.value.trim();
    if (currentProvider) setProvider(currentProvider);
    setInteractive(true);
  }, []);

  const copySignInLink = async (
    identityProvider: string,
    key: CopyState["key"],
  ) => {
    try {
      const path = identityProviderSignInPath(identityProvider, returnTo);
      await copyTextToClipboard(
        new URL(path, window.location.origin).toString(),
      );
      setCopyState({ key, status: "copied" });
    } catch {
      setCopyState({ key, status: "error" });
    }
  };

  const rememberedProviderHref = rememberedProvider
    ? identityProviderSignInPath(
        rememberedProvider.signInSlug,
        returnTo,
        authorizationPrompt,
      )
    : undefined;
  const showProviderForm = !rememberedProvider || showAlternativeProvider;

  const toggleAlternativeProvider = () => {
    const nextVisible = !showProviderForm;
    setShowAlternativeProvider(nextVisible);
    if (nextVisible) {
      window.requestAnimationFrame(() => providerInputRef.current?.focus());
    }
  };

  return (
    <AuthScene>
      <div>
        <h1 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
          {returningVisitor ? "Welcome back" : "Sign in to Sunrise"}
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

        {rememberedProvider && rememberedProviderHref ? (
          <div className="mt-7">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Previous identity provider
            </p>
            <div className="flex gap-2">
              <a
                href={rememberedProviderHref}
                className="inline-flex h-11 min-w-0 flex-1 items-center gap-3 rounded-md border border-border bg-muted/55 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <KeyRound
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {rememberedProvider.displayName}
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </a>
              <CopySignInLink
                provider={rememberedProvider.signInSlug}
                copyState={copyState}
                copyKey="remembered"
                interactive={interactive}
                onCopy={copySignInLink}
                compact
              />
            </div>
            <button
              type="button"
              aria-controls="alternative-provider-form"
              aria-expanded={showProviderForm}
              onClick={toggleAlternativeProvider}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showProviderForm
                ? "Hide other provider"
                : "Use another provider"}
              <ChevronDown
                className={`size-4 transition-transform ${showProviderForm ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}

        {showProviderForm ? (
          <form
            id="alternative-provider-form"
            action={action}
            className={rememberedProvider ? "mt-4 space-y-5" : "mt-9 space-y-5"}
          >
            {authorizationPrompt ? (
              <input
                type="hidden"
                name="authorization_prompt"
                value={authorizationPrompt}
              />
            ) : null}
            <input type="hidden" name="return_to" value={returnTo} />
            <div>
              <label
                htmlFor="id_provider"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Identity provider
              </label>
              <input
                ref={providerInputRef}
                id="id_provider"
                name="id_provider"
                type="text"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue=""
                onInput={(event) => setProvider(event.currentTarget.value)}
                className="h-11 w-full rounded-md border border-input bg-background/70 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="Enter your provider sign-in ID"
              />

              {state?.errors?.idProvider && (
                <p className="mt-2 text-sm text-status-danger" role="alert">
                  {state.errors.idProvider.join(" ")}
                </p>
              )}
            </div>

            <SubmitButton />
            <CopySignInLink
              provider={provider}
              copyState={copyState}
              copyKey="manual"
              getProvider={() => providerInputRef.current?.value ?? provider}
              interactive={interactive}
              onCopy={(identityProvider, key) => {
                setProvider(identityProvider);
                void copySignInLink(identityProvider, key);
              }}
              disableWhenEmpty={false}
            />
          </form>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          You will be redirected to your identity provider to complete sign-in.
        </p>
      </div>
    </AuthScene>
  );
}
