import { z } from 'zod';

type ValidationSuccess<T> = { ok: true; value: T; errors: [] };
type ValidationFailure = { ok: false; errors: string[] };

export type JsonDocumentValidation<T> =
  | ValidationSuccess<T>
  | ValidationFailure;

const stringOrStrings = z.union([
  z.string().min(1, 'must not be empty'),
  z.array(z.string().min(1, 'must not contain empty values')).min(1),
]);

const policyStatementFields = {
  Sid: z.string().optional(),
  Effect: z.enum(['Allow', 'Deny']),
  Principal: z.unknown().optional(),
  NotPrincipal: z.unknown().optional(),
  Action: stringOrStrings.optional(),
  NotAction: stringOrStrings.optional(),
  Resource: stringOrStrings.optional(),
  NotResource: stringOrStrings.optional(),
  Condition: z.record(z.string(), z.unknown()).optional(),
};

function requireAction(
  statement: z.infer<z.ZodObject<typeof policyStatementFields>>,
  context: z.RefinementCtx,
) {
  if (statement.Action === undefined && statement.NotAction === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'needs Action or NotAction',
      path: ['Action'],
    });
  }
}

function requirePrincipal(
  statement: z.infer<z.ZodObject<typeof policyStatementFields>>,
  context: z.RefinementCtx,
) {
  if (
    statement.Principal === undefined &&
    statement.NotPrincipal === undefined
  ) {
    context.addIssue({
      code: 'custom',
      message: 'needs Principal or NotPrincipal',
      path: ['Principal'],
    });
  }
}

function requireResource(
  statement: z.infer<z.ZodObject<typeof policyStatementFields>>,
  context: z.RefinementCtx,
) {
  if (
    statement.Resource === undefined &&
    statement.NotResource === undefined
  ) {
    context.addIssue({
      code: 'custom',
      message: 'needs Resource or NotResource',
      path: ['Resource'],
    });
  }
}

const resourcePolicyStatementSchema = z
  .object(policyStatementFields)
  .passthrough()
  .superRefine((statement, context) => {
    requirePrincipal(statement, context);
    requireAction(statement, context);
    requireResource(statement, context);
  });

const trustPolicyStatementSchema = z
  .object(policyStatementFields)
  .passthrough()
  .superRefine((statement, context) => {
    requirePrincipal(statement, context);
    requireAction(statement, context);
  });

const identityPolicyStatementSchema = z
  .object(policyStatementFields)
  .passthrough()
  .superRefine((statement, context) => {
    requireAction(statement, context);
    requireResource(statement, context);
  });

function policyDocumentSchema<T extends z.ZodType>(statement: T) {
  return z
    .object({
      Version: z.enum(['2008-10-17', '2012-10-17']).optional(),
      Statement: z.preprocess(
        (value) => (Array.isArray(value) ? value : [value]),
        z.array(statement).min(1),
      ),
    })
    .passthrough();
}

const bucketPolicySchema = policyDocumentSchema(resourcePolicyStatementSchema);
const iamTrustPolicySchema = policyDocumentSchema(trustPolicyStatementSchema);
const iamPermissionPolicySchema = policyDocumentSchema(
  identityPolicyStatementSchema,
);

const lifecycleRecord = z.record(z.string(), z.unknown());

const lifecycleRuleSchema = z
  .object({
    ID: z.string().max(255).optional(),
    Status: z.enum(['Enabled', 'Disabled']),
    Prefix: z.string().optional(),
    Filter: lifecycleRecord.optional(),
    Expiration: lifecycleRecord.optional(),
    Transitions: z.array(lifecycleRecord).optional(),
    NoncurrentVersionTransitions: z.array(lifecycleRecord).optional(),
    NoncurrentVersionExpiration: lifecycleRecord.optional(),
    AbortIncompleteMultipartUpload: lifecycleRecord.optional(),
  })
  .passthrough()
  .superRefine((rule, context) => {
    const hasAction = [
      rule.Expiration,
      rule.Transitions,
      rule.NoncurrentVersionTransitions,
      rule.NoncurrentVersionExpiration,
      rule.AbortIncompleteMultipartUpload,
    ].some((value) => value !== undefined);

    if (!hasAction) {
      context.addIssue({
        code: 'custom',
        message: 'needs at least one lifecycle action',
        path: ['Expiration'],
      });
    }
  });

const bucketLifecycleSchema = z
  .object({
    TransitionDefaultMinimumObjectSize: z
      .enum(['all_storage_classes_128K', 'varies_by_storage_class'])
      .optional(),
    Rules: z.array(lifecycleRuleSchema).min(1).max(1000),
  })
  .passthrough();

function issueMessage(issue: z.core.$ZodIssue) {
  const path = issue.path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : String(segment),
    )
    .join('.')
    .replace(/\.\[/g, '[');
  return path ? `${path}: ${issue.message}` : issue.message;
}

function validateJson<T>(
  document: string,
  schema: z.ZodType<T>,
  label: string,
): JsonDocumentValidation<T> {
  let value: unknown;
  try {
    value = JSON.parse(document) as unknown;
  } catch {
    return {
      ok: false,
      errors: [`${label} contains invalid JSON.`],
    };
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(issueMessage),
    };
  }

  return { ok: true, value: result.data, errors: [] };
}

export function validateBucketPolicyJson(
  document: string,
): JsonDocumentValidation<z.infer<typeof bucketPolicySchema>> {
  const result = validateJson(document, bucketPolicySchema, 'Bucket policy');
  if (!result.ok) return result;

  const compactPolicy = JSON.stringify(result.value);
  if (new TextEncoder().encode(compactPolicy).byteLength > 20 * 1024) {
    return {
      ok: false,
      errors: ['Bucket policies cannot exceed 20 KiB.'],
    };
  }
  return result;
}

export function validateIamTrustPolicyJson(
  document: string,
): JsonDocumentValidation<z.infer<typeof iamTrustPolicySchema>> {
  return validateJson(document, iamTrustPolicySchema, 'Trust policy');
}

export function validateIamPermissionPolicyJson(
  document: string,
): JsonDocumentValidation<z.infer<typeof iamPermissionPolicySchema>> {
  return validateJson(document, iamPermissionPolicySchema, 'Permission policy');
}

export function validateBucketLifecycleJson(
  document: string,
): JsonDocumentValidation<z.infer<typeof bucketLifecycleSchema>> {
  return validateJson(
    document,
    bucketLifecycleSchema,
    'Lifecycle configuration',
  );
}
