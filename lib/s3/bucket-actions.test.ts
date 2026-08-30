import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLocationCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getS3Client: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/mutation-context', () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock('@/lib/s3/client', () => ({
  getS3Client: mocks.getS3Client,
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import {
  createBucket,
  deleteBucket,
  getBucketSettings,
  saveBucketCors,
  saveBucketLifecycle,
  saveBucketPolicy,
} from '@/lib/s3/bucket-actions';
import { validateBucketName } from '@/lib/s3/bucket-validation';

const scope = { projectId: 'project-a', regionId: 'RegionOne' };

function s3Error(name: string, status: number) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: status, requestId: 'tx-request-id' },
  });
}

describe('S3 bucket lifecycle actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getS3Client.mockResolvedValue({ send: mocks.send });
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.send.mockResolvedValue({});
  });

  it('creates a validated bucket and refreshes affected routes', async () => {
    const result = await createBucket(scope, 'project-artifacts');

    expect(result).toMatchObject({
      ok: true,
      data: { bucket: 'project-artifacts' },
      message: 'Bucket project-artifacts was created.',
      scope,
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(CreateBucketCommand);
    expect(mocks.send.mock.calls[0][0].input).toEqual({
      Bucket: 'project-artifacts',
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/object-storage'],
      ['/object-storage/buckets'],
      ['/object-storage/buckets/project-artifacts'],
    ]);
  });

  it('rejects stale project context before acquiring an S3 client', async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        ok: false,
        status: 'error',
        error: {
          code: 'context-changed',
          message: 'The active project changed.',
          retryable: true,
        },
        scope,
      },
    });

    const result = await createBucket(scope, 'project-artifacts');

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'context-changed' },
    });
    expect(mocks.getS3Client).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('explains that object versions must be removed from a non-empty bucket', async () => {
    mocks.send.mockRejectedValue(s3Error('BucketNotEmpty', 409));

    const result = await deleteBucket(scope, 'project-artifacts');

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'conflict',
        message:
          'Remove all objects and object versions before deleting this bucket.',
        requestId: 'tx-request-id',
      },
    });
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(DeleteBucketCommand);
  });

  it('rejects invalid policy JSON before contacting RGW', async () => {
    const result = await saveBucketPolicy(
      scope,
      'project-artifacts',
      '{invalid',
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'validation-failed',
        message: 'Bucket policy contains invalid JSON.',
      },
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('serializes structured CORS rules into the S3 command', async () => {
    const result = await saveBucketCors(scope, 'project-artifacts', [
      {
        id: 'web-app',
        allowedHeaders: ['*'],
        allowedMethods: ['get', 'PUT'],
        allowedOrigins: ['http://localhost:9990'],
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 3600,
      },
    ]);

    expect(result.ok).toBe(true);
    const command = mocks.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutBucketCorsCommand);
    expect(command.input).toEqual({
      Bucket: 'project-artifacts',
      CORSConfiguration: {
        CORSRules: [
          {
            ID: 'web-app',
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT'],
            AllowedOrigins: ['http://localhost:9990'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });
  });

  it('validates and serializes a lifecycle configuration', async () => {
    const result = await saveBucketLifecycle(
      scope,
      'project-artifacts',
      JSON.stringify({
        Rules: [
          {
            ID: 'expire-temp',
            Status: 'Enabled',
            Prefix: 'tmp/',
            Expiration: { Days: 30 },
            Transitions: [
              {
                Date: '2027-01-01T00:00:00.000Z',
                StorageClass: 'COLD',
              },
            ],
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    const command = mocks.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutBucketLifecycleConfigurationCommand);
    expect(command.input).toEqual({
      Bucket: 'project-artifacts',
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'expire-temp',
            Status: 'Enabled',
            Prefix: 'tmp/',
            Expiration: { Days: 30 },
            Transitions: [
              {
                Date: new Date('2027-01-01T00:00:00.000Z'),
                StorageClass: 'COLD',
              },
            ],
          },
        ],
      },
    });
  });

  it('rejects lifecycle rules without an action before contacting RGW', async () => {
    const result = await saveBucketLifecycle(
      scope,
      'project-artifacts',
      JSON.stringify({
        Rules: [{ ID: 'empty-rule', Status: 'Enabled', Prefix: '' }],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'validation-failed',
        message:
          'Rules[0].Expiration: needs at least one lifecycle action',
      },
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('keeps readable bucket settings when policy and CORS access differ', async () => {
    mocks.send.mockImplementation((command) => {
      if (command instanceof GetBucketLocationCommand) {
        return Promise.resolve({ LocationConstraint: 'default-placement' });
      }
      if (command instanceof GetBucketVersioningCommand) {
        return Promise.resolve({ Status: 'Enabled' });
      }
      if (command instanceof GetBucketPolicyCommand) {
        return Promise.reject(s3Error('AccessDenied', 403));
      }
      if (command instanceof GetBucketCorsCommand) {
        return Promise.reject(s3Error('NoSuchCORSConfiguration', 404));
      }
      if (command instanceof GetBucketLifecycleConfigurationCommand) {
        return Promise.reject(s3Error('AccessDenied', 403));
      }
      throw new Error('Unexpected command');
    });

    const result = await getBucketSettings(scope, 'project-artifacts');

    expect(result).toEqual({
      ok: true,
      bucket: 'project-artifacts',
      bucketArn: 'arn:aws:s3:::project-artifacts',
      location: { status: 'loaded', value: 'default-placement' },
      versioning: { status: 'loaded', value: 'Enabled' },
      policy: {
        status: 'permission-denied',
        message: 'Your current role cannot read the bucket policy.',
      },
      cors: { status: 'not-configured' },
      lifecycle: {
        status: 'permission-denied',
        message: 'Your current role cannot read the lifecycle configuration.',
      },
    });
  });
});

describe('bucket name validation', () => {
  it('accepts standard S3 bucket names', () => {
    expect(validateBucketName('project-artifacts.2026')).toBeNull();
  });

  it.each([
    ['AB', 'between 3 and 63'],
    ['Project_Data', 'lowercase letters'],
    ['project..data', 'cannot be adjacent'],
    ['192.168.1.20', 'IP address format'],
  ])('rejects %s', (name, message) => {
    expect(validateBucketName(name)).toContain(message);
  });
});
