import "server-only";

import { z } from "zod";

import { createSecretSchema } from "@/lib/openstack/barbican-input";
import { barbicanIdFromRef } from "@/lib/openstack/barbican-schema";
import {
  BARBICAN_API_VERSION,
  BARBICAN_SERVICE,
} from "@/lib/openstack/barbican-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";

export type CreatedBarbicanSecret = {
  secretId: string;
  secretRef: string;
};

const createResponseSchema = z.object({ secret_ref: z.string() });

export async function createBarbicanSecret(
  scope: MutationScope,
  input: unknown,
): Promise<MutationResult<CreatedBarbicanSecret>> {
  const parsed = createSecretSchema.safeParse(input);
  if (!parsed.success) {
    return mutationFailure(
      {
        code: "validation-failed",
        message:
          parsed.error.issues[0]?.message ?? "Review the secret and try again.",
        retryable: false,
      },
      scope,
    );
  }

  if (
    parsed.data.expiration &&
    Date.parse(parsed.data.expiration) <= Date.now()
  ) {
    return mutationFailure(
      {
        code: "validation-failed",
        message: "Expiration must be in the future.",
        retryable: false,
      },
      scope,
    );
  }

  const payload = parsed.data.payload;
  const encodedPayload =
    parsed.data.payloadEncoding === "base64"
      ? payload?.replace(/\s+/g, "")
      : payload;

  return executeOpenStackMutation({
    actionLabel: "create a secret",
    scope,
    ...BARBICAN_SERVICE,
    apiVersion: BARBICAN_API_VERSION,
    path: "/v1/secrets",
    method: "POST",
    body: {
      name: parsed.data.name,
      secret_type: parsed.data.secretType,
      payload: encodedPayload?.length ? encodedPayload : undefined,
      payload_content_type: encodedPayload
        ? parsed.data.contentType
        : undefined,
      payload_content_encoding:
        encodedPayload && parsed.data.payloadEncoding === "base64"
          ? "base64"
          : undefined,
      expiration: parsed.data.expiration
        ? new Date(parsed.data.expiration).toISOString()
        : undefined,
      algorithm: parsed.data.algorithm || undefined,
      bit_length: parsed.data.bitLength,
      mode: parsed.data.mode || undefined,
    },
    invalidates: ["/key-manager", "/key-manager/secrets"],
    successMessage: `Secret ${parsed.data.name} was created.`,
    transform: (value) => {
      const response = createResponseSchema.parse(value);
      return {
        secretId: barbicanIdFromRef(response.secret_ref, "secret"),
        secretRef: response.secret_ref,
      };
    },
  });
}
