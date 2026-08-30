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
