import { z } from "zod";
import type {
  ApplicationCredential,
  CreatedApplicationCredential,
  KeystoneRole,
} from "@/types/openstack";

const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain_id: z.string().nullable().optional(),
});

const returnedAccessRuleSchema = z.object({
  id: z.string().min(1).optional(),
  method: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  service: z.string().min(1).optional(),
});

const applicationCredentialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional().transform((value) => value ?? null),
  project_id: z.string().min(1),
  expires_at: z.string().nullable().optional().transform((value) => value ?? null),
  unrestricted: z.boolean().default(false),
  roles: z.array(roleSchema).default([]),
  access_rules: z.array(returnedAccessRuleSchema).default([]),
  links: z.object({ self: z.string().optional() }).optional(),
});

const createdApplicationCredentialSchema = applicationCredentialSchema.extend({
  secret: z.string().min(1),
});

const applicationCredentialListSchema = z.object({
  application_credentials: z.array(applicationCredentialSchema).default([]),
});

const applicationCredentialResponseSchema = z.object({
  application_credential: applicationCredentialSchema,
});

const createdApplicationCredentialResponseSchema = z.object({
  application_credential: createdApplicationCredentialSchema,
});

export const applicationCredentialNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a credential name.")
  .max(255, "Credential names cannot exceed 255 characters.");

const accessRuleSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    service: z.string().trim().min(1, "Service is required.").optional(),
    method: z.string().trim().min(1, "HTTP method is required.").optional(),
    path: z
      .string()
      .trim()
      .min(1, "Path is required.")
      .startsWith("/", "Path must start with /.")
      .max(2_048)
      .optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.id) {
      if (rule.service || rule.method || rule.path) {
        context.addIssue({
          code: "custom",
          message: "A reused rule ID cannot be combined with a rule definition.",
        });
      }
      return;
    }

    for (const [field, value, message] of [
      ["service", rule.service, "Service is required."],
      ["method", rule.method, "HTTP method is required."],
      ["path", rule.path, "Path is required."],
    ] as const) {
      if (!value) {
        context.addIssue({ code: "custom", message, path: [field] });
      }
    }
  })
  .transform((rule) => ({
    ...rule,
    method: rule.method?.toUpperCase(),
  }));

const accessRulesSchema = z
  .array(accessRuleSchema)
  .max(100, "No more than 100 access rules can be submitted at once.");

export type ApplicationCredentialAccessRuleInput = z.output<
  typeof accessRulesSchema
>[number];

const createApplicationCredentialSchema = z.object({
  name: applicationCredentialNameSchema,
  description: z.string().trim().max(255).optional(),
  secret: z.string().min(1).max(255).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  roleIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
  accessRules: accessRulesSchema.default([]),
  unrestricted: z.boolean().default(false),
});

export type CreateApplicationCredentialInput = z.input<
  typeof createApplicationCredentialSchema
>;

export type ValidatedApplicationCredentialInput = z.output<
  typeof createApplicationCredentialSchema
>;

export function parseCreateApplicationCredentialInput(value: unknown) {
  return createApplicationCredentialSchema.safeParse(value);
}

export function parseAccessRulesJson(document: string):
  | { ok: true; value: ApplicationCredentialAccessRuleInput[]; errors: [] }
  | { ok: false; errors: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(document) as unknown;
  } catch {
    return { ok: false, errors: ["Access rules contain invalid JSON."] };
  }

  const result = accessRulesSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path
          .map((segment) =>
            typeof segment === "number" ? `[${segment}]` : String(segment),
          )
          .join(".")
          .replace(/\.\[/g, "[");
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  return { ok: true, value: result.data, errors: [] };
}

export function parseApplicationCredentialList(
  value: unknown,
): ApplicationCredential[] {
  return applicationCredentialListSchema.parse(value).application_credentials;
}

export function parseApplicationCredential(
  value: unknown,
): ApplicationCredential {
  return applicationCredentialResponseSchema.parse(value).application_credential;
}

export function parseCreatedApplicationCredential(
  value: unknown,
): CreatedApplicationCredential {
  return createdApplicationCredentialResponseSchema.parse(value)
    .application_credential;
}

export function normalizeTokenRoles(value: unknown): KeystoneRole[] {
  const result = z.array(roleSchema).safeParse(value);
  return result.success ? result.data : [];
}
