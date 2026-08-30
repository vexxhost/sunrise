'use server';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteBucketCorsCommand,
  DeleteBucketLifecycleCommand,
  DeleteBucketPolicyCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLocationCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  PutBucketVersioningCommand,
  type BucketLifecycleConfiguration,
  type S3Client,
} from '@aws-sdk/client-s3';
import { revalidatePath } from 'next/cache';
import {
  validateBucketLifecycleJson,
  validateBucketPolicyJson,
} from '@/lib/json-document';
import { guardMutationContext } from '@/lib/mutation-context';
import {
  mutationErrorForStatus,
  mutationFailure,
  mutationSuccess,
  type MutationError,
  type MutationFailure,
  type MutationResult,
  type MutationScope,
} from '@/lib/mutations';
import { bucketArn } from '@/lib/s3/arn';
import { validateBucketName } from '@/lib/s3/bucket-validation';
import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

export type BucketVersioningState = 'Unversioned' | 'Enabled' | 'Suspended';

export type BucketCorsRule = {
  id: string;
  allowedHeaders: string[];
  allowedMethods: string[];
  allowedOrigins: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number | null;
};

export type BucketSetting<T> =
  | { status: 'loaded'; value: T }
  | { status: 'not-configured' }
  | { status: 'permission-denied'; message: string }
  | { status: 'error'; message: string; requestId?: string };

export type BucketSettingsResult =
  | {
      ok: true;
      bucket: string;
      bucketArn: string;
      location: BucketSetting<string | null>;
      versioning: BucketSetting<BucketVersioningState>;
      policy: BucketSetting<string>;
      cors: BucketSetting<BucketCorsRule[]>;
      lifecycle: BucketSetting<string>;
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

type PreparedMutation =
  | { ok: true; client: S3Client; scope: MutationScope }
  | { ok: false; result: MutationFailure };

function errorName(error: unknown) {
  const value = error as { Code?: string; name?: string };
  return value?.name ?? value?.Code ?? 'UnknownError';
}

function errorStatus(error: unknown) {
  const value = error as { $metadata?: { httpStatusCode?: number } };
  return value?.$metadata?.httpStatusCode;
}

function errorRequestId(error: unknown) {
  const value = error as {
    $metadata?: { requestId?: string; extendedRequestId?: string };
  };
  return value?.$metadata?.requestId ?? value?.$metadata?.extendedRequestId;
}

function isAccessDenied(error: unknown) {
  return errorStatus(error) === 403 || errorName(error) === 'AccessDenied';
}

function isAbsentConfiguration(error: unknown, names: string[]) {
  return errorStatus(error) === 404 && names.includes(errorName(error));
}

function settingError<T>(
  error: unknown,
  label: string,
  absentNames: string[] = [],
): BucketSetting<T> {
  if (isAbsentConfiguration(error, absentNames)) {
    return { status: 'not-configured' };
  }
  if (isAccessDenied(error)) {
    return {
      status: 'permission-denied',
      message: `Your current role cannot read ${label}.`,
    };
  }
  return {
    status: 'error',
    message: `Could not load ${label}.`,
    requestId: errorRequestId(error),
  };
}

async function loadSetting<T>(
  loader: () => Promise<T>,
  label: string,
  absentNames: string[] = [],
): Promise<BucketSetting<T>> {
  try {
    return { status: 'loaded', value: await loader() };
  } catch (error) {
    return settingError(error, label, absentNames);
  }
}

function prettyPolicy(policy: string) {
  try {
    return JSON.stringify(JSON.parse(policy) as unknown, null, 2);
  } catch {
    return policy;
  }
}

function toCorsRules(
  rules:
    | Array<{
        ID?: string;
        AllowedHeaders?: string[];
        AllowedMethods?: string[];
        AllowedOrigins?: string[];
        ExposeHeaders?: string[];
        MaxAgeSeconds?: number;
      }>
    | undefined,
): BucketCorsRule[] {
  return (rules ?? []).map((rule, index) => ({
    id: rule.ID ?? `rule-${index + 1}`,
    allowedHeaders: rule.AllowedHeaders ?? [],
    allowedMethods: rule.AllowedMethods ?? [],
    allowedOrigins: rule.AllowedOrigins ?? [],
    exposeHeaders: rule.ExposeHeaders ?? [],
    maxAgeSeconds: rule.MaxAgeSeconds ?? null,
  }));
}

export async function getBucketSettings(
  expectedScope: MutationScope,
  bucket: string,
): Promise<BucketSettingsResult> {
  const guarded = await guardMutationContext(expectedScope, {
    requireProjectToken: false,
  });
  if (!guarded.ok) {
    return guarded.result.error.code === 'authentication-required'
      ? { ok: false, needsAuth: true }
      : {
          ok: false,
          needsAuth: false,
          error: guarded.result.error.message,
        };
  }

  const normalizedBucket = bucket.trim();
  if (!normalizedBucket) {
    return { ok: false, needsAuth: false, error: 'Missing bucket name.' };
  }

  let client: S3Client;
  try {
    client = await getS3Client({ allowCredentialRefresh: true });
  } catch (error) {
    if (error instanceof S3AuthRequiredError) {
      return { ok: false, needsAuth: true };
    }
    return {
      ok: false,
      needsAuth: false,
      error: 'Object Storage could not be reached. Try again shortly.',
    };
  }

  const [location, versioning, policy, cors, lifecycle] = await Promise.all([
    loadSetting(
      async () => {
        const result = await client.send(
          new GetBucketLocationCommand({ Bucket: normalizedBucket }),
        );
        return result.LocationConstraint ?? null;
      },
      'bucket location',
    ),
    loadSetting(
      async () => {
        const result = await client.send(
          new GetBucketVersioningCommand({ Bucket: normalizedBucket }),
        );
        return (result.Status ?? 'Unversioned') as BucketVersioningState;
      },
      'bucket versioning',
    ),
    loadSetting(
      async () => {
        const result = await client.send(
          new GetBucketPolicyCommand({ Bucket: normalizedBucket }),
        );
        return prettyPolicy(result.Policy ?? '{}');
      },
      'the bucket policy',
      ['NoSuchBucketPolicy'],
    ),
    loadSetting(
      async () => {
        const result = await client.send(
          new GetBucketCorsCommand({ Bucket: normalizedBucket }),
        );
        return toCorsRules(result.CORSRules);
      },
      'the CORS configuration',
      ['NoSuchCORSConfiguration', 'NoSuchCORSConfig'],
    ),
    loadSetting(
      async () => {
        const result = await client.send(
          new GetBucketLifecycleConfigurationCommand({
            Bucket: normalizedBucket,
          }),
        );
        return JSON.stringify({ Rules: result.Rules ?? [] }, null, 2);
      },
      'the lifecycle configuration',
      ['NoSuchLifecycleConfiguration'],
    ),
  ]);

  return {
    ok: true,
    bucket: normalizedBucket,
    bucketArn: bucketArn(normalizedBucket),
    location,
    versioning,
    policy,
    cors,
    lifecycle,
  };
}

async function prepareMutation(
  expectedScope: MutationScope,
): Promise<PreparedMutation> {
  const guarded = await guardMutationContext(expectedScope, {
    requireProjectToken: false,
  });
  if (!guarded.ok) return { ok: false, result: guarded.result };

  try {
    return {
      ok: true,
      client: await getS3Client({ allowCredentialRefresh: true }),
      scope: guarded.context.scope,
    };
  } catch (error) {
    const mutationError: MutationError =
      error instanceof S3AuthRequiredError
        ? {
            code: 'authentication-required',
            message: 'Your Object Storage session expired. Sign in and try again.',
            retryable: true,
          }
        : {
            code: 'network-error',
            message: 'Object Storage could not be reached. Try again shortly.',
            retryable: true,
          };
    return {
      ok: false,
      result: mutationFailure(mutationError, guarded.context.scope),
    };
  }
}

function s3MutationError(
  error: unknown,
  actionLabel: string,
  conflictMessage?: string,
): MutationError {
  const status = errorStatus(error);
  const requestId = errorRequestId(error);
  const name = errorName(error);

  if (
    status === 409 ||
    ['BucketAlreadyExists', 'BucketAlreadyOwnedByYou', 'BucketNotEmpty'].includes(
      name,
    )
  ) {
    return {
      code: 'conflict',
      message:
        conflictMessage ??
        'The bucket changed before this action completed. Refresh and try again.',
      requestId,
      retryable: true,
      status: status ?? 409,
    };
  }

  if (status) {
    return mutationErrorForStatus(status, actionLabel, requestId);
  }

  return {
    code: 'network-error',
    message: 'Object Storage could not be reached. Try again shortly.',
    requestId,
    retryable: true,
  };
}

function revalidateBuckets(bucket?: string) {
  revalidatePath('/object-storage');
  revalidatePath('/object-storage/buckets');
  if (bucket) {
    revalidatePath(
      `/object-storage/buckets/${encodeURIComponent(bucket)}`,
    );
  }
}

export async function createBucket(
  expectedScope: MutationScope,
  bucket: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const normalizedBucket = bucket.trim();
  const validationError = validateBucketName(normalizedBucket);
  if (validationError) {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: validationError,
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new CreateBucketCommand({ Bucket: normalizedBucket }),
    );
  } catch (error) {
    const name = errorName(error);
    const conflictMessage =
      name === 'BucketAlreadyOwnedByYou'
        ? 'This Object Storage account already owns a bucket with this name.'
        : name === 'BucketAlreadyExists'
          ? 'This bucket name is already in use or unavailable to this Object Storage account.'
          : undefined;
    return mutationFailure(
      s3MutationError(error, 'create this bucket', conflictMessage),
      prepared.scope,
    );
  }

  revalidateBuckets(normalizedBucket);
  return mutationSuccess({
    data: { bucket: normalizedBucket },
    message: `Bucket ${normalizedBucket} was created.`,
    scope: prepared.scope,
  });
}

export async function deleteBucket(
  expectedScope: MutationScope,
  bucket: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const normalizedBucket = bucket.trim();
  if (!normalizedBucket) {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: 'Missing bucket name.',
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new DeleteBucketCommand({ Bucket: normalizedBucket }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(
        error,
        'delete this bucket',
        errorName(error) === 'BucketNotEmpty'
          ? 'Remove all objects and object versions before deleting this bucket.'
          : undefined,
      ),
      prepared.scope,
    );
  }

  revalidateBuckets();
  return mutationSuccess({
    data: { bucket: normalizedBucket },
    message: `Bucket ${normalizedBucket} was deleted.`,
    scope: prepared.scope,
  });
}

function parsePolicy(policy: string):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const result = validateBucketPolicyJson(policy);
  return result.ok
    ? { ok: true, value: JSON.stringify(result.value) }
    : { ok: false, message: result.errors.join(' ') };
}

export async function saveBucketPolicy(
  expectedScope: MutationScope,
  bucket: string,
  policy: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const parsed = parsePolicy(policy);
  if (!parsed.ok) {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: parsed.message,
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new PutBucketPolicyCommand({ Bucket: bucket, Policy: parsed.value }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'update this bucket policy'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket policy saved.',
    scope: prepared.scope,
  });
}

export async function removeBucketPolicy(
  expectedScope: MutationScope,
  bucket: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  try {
    await prepared.client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'remove this bucket policy'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket policy removed.',
    scope: prepared.scope,
  });
}

function lifecycleDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function parseLifecycleConfiguration(configuration: string):
  | { ok: true; value: BucketLifecycleConfiguration }
  | { ok: false; message: string } {
  const validated = validateBucketLifecycleJson(configuration);
  if (!validated.ok) {
    return { ok: false, message: validated.errors.join(' ') };
  }

  const normalizedRules = [];
  for (const value of validated.value.Rules) {
    const rule = value as Record<string, unknown>;
    const expiration =
      rule.Expiration &&
      typeof rule.Expiration === 'object' &&
      !Array.isArray(rule.Expiration)
        ? {
            ...(rule.Expiration as Record<string, unknown>),
            ...('Date' in rule.Expiration
              ? {
                  Date: lifecycleDate(
                    (rule.Expiration as Record<string, unknown>).Date,
                  ),
                }
              : {}),
          }
        : rule.Expiration;
    const transitions = Array.isArray(rule.Transitions)
      ? rule.Transitions.map((transition) =>
          transition &&
          typeof transition === 'object' &&
          !Array.isArray(transition)
            ? {
                ...(transition as Record<string, unknown>),
                ...('Date' in transition
                  ? {
                      Date: lifecycleDate(
                        (transition as Record<string, unknown>).Date,
                      ),
                    }
                  : {}),
              }
            : transition,
        )
      : rule.Transitions;

    normalizedRules.push({ ...rule, Expiration: expiration, Transitions: transitions });
  }

  return {
    ok: true,
    value: { Rules: normalizedRules } as BucketLifecycleConfiguration,
  };
}

export async function saveBucketLifecycle(
  expectedScope: MutationScope,
  bucket: string,
  configuration: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const parsed = parseLifecycleConfiguration(configuration);
  if (!parsed.ok) {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: parsed.message,
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: parsed.value,
      }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'update this bucket lifecycle configuration'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket lifecycle configuration saved.',
    scope: prepared.scope,
  });
}

export async function removeBucketLifecycle(
  expectedScope: MutationScope,
  bucket: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  try {
    await prepared.client.send(
      new DeleteBucketLifecycleCommand({ Bucket: bucket }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'remove this bucket lifecycle configuration'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket lifecycle configuration removed.',
    scope: prepared.scope,
  });
}

const CORS_METHODS = new Set(['GET', 'PUT', 'POST', 'DELETE', 'HEAD']);

function normalizeCorsRules(rules: BucketCorsRule[]):
  | { ok: true; value: BucketCorsRule[] }
  | { ok: false; message: string } {
  if (rules.length === 0) {
    return { ok: false, message: 'Add at least one CORS rule.' };
  }
  if (rules.length > 100) {
    return { ok: false, message: 'CORS configuration cannot exceed 100 rules.' };
  }

  const normalized = rules.map((rule, index) => ({
    id: rule.id.trim(),
    allowedHeaders: rule.allowedHeaders.map((value) => value.trim()).filter(Boolean),
    allowedMethods: Array.from(
      new Set(rule.allowedMethods.map((value) => value.trim().toUpperCase())),
    ),
    allowedOrigins: rule.allowedOrigins.map((value) => value.trim()).filter(Boolean),
    exposeHeaders: rule.exposeHeaders.map((value) => value.trim()).filter(Boolean),
    maxAgeSeconds: rule.maxAgeSeconds,
    index,
  }));

  for (const rule of normalized) {
    if (rule.allowedOrigins.length === 0) {
      return {
        ok: false,
        message: `CORS rule ${rule.index + 1} needs an allowed origin.`,
      };
    }
    if (
      rule.allowedMethods.length === 0 ||
      rule.allowedMethods.some((method) => !CORS_METHODS.has(method))
    ) {
      return {
        ok: false,
        message: `CORS rule ${rule.index + 1} needs at least one supported method.`,
      };
    }
    if (
      rule.maxAgeSeconds !== null &&
      (!Number.isInteger(rule.maxAgeSeconds) || rule.maxAgeSeconds < 0)
    ) {
      return {
        ok: false,
        message: `CORS rule ${rule.index + 1} has an invalid max age.`,
      };
    }
  }

  return {
    ok: true,
    value: normalized.map(({ index: _index, ...rule }) => rule),
  };
}

export async function saveBucketCors(
  expectedScope: MutationScope,
  bucket: string,
  rules: BucketCorsRule[],
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const normalized = normalizeCorsRules(rules);
  if (!normalized.ok) {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: normalized.message,
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: normalized.value.map((rule) => ({
            ID: rule.id || undefined,
            AllowedHeaders:
              rule.allowedHeaders.length > 0 ? rule.allowedHeaders : undefined,
            AllowedMethods: rule.allowedMethods,
            AllowedOrigins: rule.allowedOrigins,
            ExposeHeaders:
              rule.exposeHeaders.length > 0 ? rule.exposeHeaders : undefined,
            MaxAgeSeconds: rule.maxAgeSeconds ?? undefined,
          })),
        },
      }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'update this bucket CORS configuration'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket CORS configuration saved.',
    scope: prepared.scope,
  });
}

export async function removeBucketCors(
  expectedScope: MutationScope,
  bucket: string,
): Promise<MutationResult<{ bucket: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  try {
    await prepared.client.send(new DeleteBucketCorsCommand({ Bucket: bucket }));
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'remove this bucket CORS configuration'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket },
    message: 'Bucket CORS configuration removed.',
    scope: prepared.scope,
  });
}

export async function updateBucketVersioning(
  expectedScope: MutationScope,
  bucket: string,
  status: Exclude<BucketVersioningState, 'Unversioned'>,
): Promise<MutationResult<{ bucket: string; status: string }>> {
  const prepared = await prepareMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  if (status !== 'Enabled' && status !== 'Suspended') {
    return mutationFailure(
      {
        code: 'validation-failed',
        message: 'Choose Enabled or Suspended for bucket versioning.',
        retryable: false,
      },
      prepared.scope,
    );
  }

  try {
    await prepared.client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: status },
      }),
    );
  } catch (error) {
    return mutationFailure(
      s3MutationError(error, 'update bucket versioning'),
      prepared.scope,
    );
  }

  revalidateBuckets(bucket);
  return mutationSuccess({
    data: { bucket, status },
    message: `Bucket versioning ${status === 'Enabled' ? 'enabled' : 'suspended'}.`,
    scope: prepared.scope,
  });
}
