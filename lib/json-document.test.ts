import { describe, expect, it } from 'vitest';
import {
  validateBucketLifecycleJson,
  validateBucketPolicyJson,
} from '@/lib/json-document';

describe('bucket policy JSON validation', () => {
  it('accepts a resource policy with the required statement fields', () => {
    const result = validateBucketPolicyJson(
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: ['arn:aws:s3:::artifacts/*'],
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('reports schema paths for incomplete statements', () => {
    const result = validateBucketPolicyJson(
      JSON.stringify({ Statement: [{ Effect: 'Allow' }] }),
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Statement[0].Principal: needs Principal or NotPrincipal',
        'Statement[0].Action: needs Action or NotAction',
        'Statement[0].Resource: needs Resource or NotResource',
      ],
    });
  });

  it('rejects invalid JSON before schema validation', () => {
    expect(validateBucketPolicyJson('{invalid')).toEqual({
      ok: false,
      errors: ['Bucket policy contains invalid JSON.'],
    });
  });

  it('measures the compact policy instead of editor formatting', () => {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: Array.from(
            { length: 455 },
            (_, index) => `arn:aws:s3:::artifacts/object-${index}`,
          ),
        },
      ],
    };
    const formatted = JSON.stringify(policy, null, 2);

    expect(new TextEncoder().encode(formatted).byteLength).toBeGreaterThan(
      20 * 1024,
    );
    expect(validateBucketPolicyJson(formatted).ok).toBe(true);
  });

  it('rejects a policy whose compact representation exceeds 20 KiB', () => {
    const policy = JSON.stringify({
      Statement: [
        {
          Sid: 'x'.repeat(21 * 1024),
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::artifacts/*',
        },
      ],
    });

    expect(validateBucketPolicyJson(policy)).toEqual({
      ok: false,
      errors: ['Bucket policies cannot exceed 20 KiB.'],
    });
  });
});

describe('bucket lifecycle JSON validation', () => {
  it('accepts lifecycle expiration and multipart cleanup actions', () => {
    const result = validateBucketLifecycleJson(
      JSON.stringify({
        Rules: [
          {
            ID: 'expire-temp',
            Status: 'Enabled',
            Prefix: 'tmp/',
            Expiration: { Days: 30 },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts the lifecycle transition minimum object size setting', () => {
    const result = validateBucketLifecycleJson(
      JSON.stringify({
        TransitionDefaultMinimumObjectSize: 'varies_by_storage_class',
        Rules: [
          {
            Status: 'Enabled',
            Expiration: { Days: 30 },
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('identifies the rule and field for invalid lifecycle status', () => {
    const result = validateBucketLifecycleJson(
      JSON.stringify({
        Rules: [{ Status: 'Running', Expiration: { Days: 30 } }],
      }),
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Rules[0].Status: Invalid option: expected one of "Enabled"|"Disabled"',
      ],
    });
  });
});
