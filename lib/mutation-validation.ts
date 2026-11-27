import type { z } from "zod";
import {
  mutationFailure,
  type MutationFailure,
  type MutationScope,
} from "@/lib/mutations";

const DEFAULT_VALIDATION_MESSAGE = "Review the values and try again.";

export type ParsedMutationInput<T> =
  { ok: true; value: T } | { ok: false; result: MutationFailure };

export function validationFailure(
  scope: MutationScope,
  message: string,
): MutationFailure {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

/**
 * Validate server action input against a Zod schema. A failure becomes a
 * `validation-failed` mutation result carrying the first issue's message, so
 * callers can return it directly.
 */
export function parseMutationInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  scope: MutationScope,
): ParsedMutationInput<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    result: validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? DEFAULT_VALIDATION_MESSAGE,
    ),
  };
}
