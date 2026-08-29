import "server-only";

import { getSession } from "@/lib/session";
import {
  mutationFailure,
  mutationScopeError,
  type MutationFailure,
  type MutationScope,
} from "@/lib/mutations";

type MutationContextOptions = {
  requireProjectToken?: boolean;
  requireRegion?: boolean;
};

export type GuardedMutationContext = {
  projectToken?: string;
  scope: MutationScope;
};

export async function guardMutationContext(
  expected: MutationScope,
  {
    requireProjectToken = true,
    requireRegion = true,
  }: MutationContextOptions = {},
): Promise<
  | { ok: true; context: GuardedMutationContext }
  | { ok: false; result: MutationFailure }
> {
  const session = await getSession();
  const active: MutationScope = {
    projectId: session.projectId ?? "",
    regionId: session.regionId,
  };
  const scopeError = mutationScopeError(active, expected, requireRegion);

  if (scopeError) {
    return { ok: false, result: mutationFailure(scopeError, active) };
  }

  if (requireProjectToken && !session.keystoneProjectToken) {
    return {
      ok: false,
      result: mutationFailure(
        {
          code: "authentication-required",
          message: "Your cloud session expired. Sign in and try again.",
          retryable: true,
        },
        active,
      ),
    };
  }

  return {
    ok: true,
    context: {
      projectToken: session.keystoneProjectToken,
      scope: active,
    },
  };
}
