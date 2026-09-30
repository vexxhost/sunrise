import { z } from "zod";

const optionalText = z.string().trim().max(255).optional();
const resourceId = z.string().trim().min(1).max(255);
export const BARBICAN_PAYLOAD_LIMIT_BYTES = 100_000;
const secretReference = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        /^\/v1\/secrets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
          url.pathname,
        )
      );
    } catch {
      return false;
    }
  }, "Secret reference must point to a Barbican secret UUID.");
const metadata = z
  .record(z.string().trim().min(1).max(255), z.string().max(255))
  .refine((value) => Object.keys(value).length <= 64, {
    message: "Use no more than 64 metadata entries.",
  });

export const createSecretSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    secretType: z.enum([
      "opaque",
      "symmetric",
      "public",
      "private",
      "passphrase",
      "certificate",
    ]),
    payload: z.string().max(100_000).optional(),
    payloadEncoding: z.enum(["plain", "base64"]),
    contentType: z.string().trim().min(1).max(255),
    expiration: z.string().trim().max(64).optional(),
    algorithm: optionalText,
    bitLength: z.number().int().positive().max(1_048_576).optional(),
    mode: optionalText,
  })
  .superRefine((value, context) => {
    if (
      value.payload &&
      new TextEncoder().encode(value.payload).byteLength >
        BARBICAN_PAYLOAD_LIMIT_BYTES
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: `Payload must be ${BARBICAN_PAYLOAD_LIMIT_BYTES.toLocaleString("en")} bytes or smaller.`,
      });
    }
    if (value.payloadEncoding === "base64" && value.payload) {
      const normalized = value.payload.replace(/\s+/g, "");
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          normalized,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload"],
          message: "Payload must be valid base64.",
        });
      }
    }
    if (value.expiration && Number.isNaN(Date.parse(value.expiration))) {
      context.addIssue({
        code: "custom",
        path: ["expiration"],
        message: "Expiration must be a valid date and time.",
      });
    }
  });

export const metadataSchema = z.object({ metadata });
export const aclSchema = z.object({
  users: z.array(z.string().trim().min(1).max(255)).max(100),
  projectAccess: z.boolean(),
});
export const secretConsumerSchema = z.object({
  service: z.string().trim().min(1).max(255),
  resourceType: z.string().trim().min(1).max(255),
  resourceId,
});
export const containerConsumerSchema = z.object({
  name: z.string().trim().min(1).max(36),
  url: z.string().trim().min(1).max(255),
});
export const containerSecretRefSchema = z.object({
  name: z.string().trim().max(255).optional(),
  secretRef: secretReference,
});
export const createContainerSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    type: z.enum(["generic", "rsa", "certificate"]),
    secretRefs: z.array(containerSecretRefSchema).max(100),
  })
  .superRefine((value, context) => {
    const names = value.secretRefs.map(({ name }) => name).filter(Boolean);
    const refs = value.secretRefs.map(({ secretRef }) => secretRef);
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        path: ["secretRefs"],
        message: "Secret reference names must be unique.",
      });
    }
    if (new Set(refs).size !== refs.length) {
      context.addIssue({
        code: "custom",
        path: ["secretRefs"],
        message: "Each secret can be referenced only once.",
      });
    }

    const allowed =
      value.type === "rsa"
        ? new Set(["public_key", "private_key", "private_key_passphrase"])
        : value.type === "certificate"
          ? new Set([
              "certificate",
              "private_key",
              "private_key_passphrase",
              "intermediates",
            ])
          : null;
    if (!allowed) return;

    for (const [index, reference] of value.secretRefs.entries()) {
      if (!reference.name || !allowed.has(reference.name)) {
        context.addIssue({
          code: "custom",
          path: ["secretRefs", index, "name"],
          message: `Invalid ${value.type} container reference name.`,
        });
      }
    }
    const required =
      value.type === "rsa" ? ["public_key", "private_key"] : ["certificate"];
    for (const name of required) {
      if (!value.secretRefs.some((reference) => reference.name === name)) {
        context.addIssue({
          code: "custom",
          path: ["secretRefs"],
          message: `${value.type} containers require a ${name} reference.`,
        });
      }
    }
  });
export const createOrderSchema = z.object({
  type: z.enum(["key", "asymmetric"]),
  name: z.string().trim().min(1).max(255),
  algorithm: z.string().trim().min(1).max(255),
  bitLength: z.number().int().positive().max(1_048_576),
  mode: optionalText,
  expiration: z.string().trim().max(64).optional(),
});

export type CreateSecretInput = z.input<typeof createSecretSchema>;
export type CreateContainerInput = z.input<typeof createContainerSchema>;
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type SecretConsumerInput = z.input<typeof secretConsumerSchema>;
export type ContainerConsumerInput = z.input<typeof containerConsumerSchema>;
export type BarbicanAclInput = z.input<typeof aclSchema>;
