import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureActiveProjectS3Credentials: vi.fn(),
  getActiveS3Credentials: vi.fn(),
  getS3Endpoint: vi.fn(),
  getSession: vi.fn(),
  iamClientConstructor: vi.fn(),
  iamClient: { destroy: vi.fn() },
}));

vi.mock('server-only', () => ({}));

vi.mock('@aws-sdk/client-iam', () => ({
  IAMClient: class {
    constructor(config: unknown) {
      mocks.iamClientConstructor(config);
      return mocks.iamClient;
    }
  },
}));

vi.mock('@/lib/session', () => ({
  getActiveS3Credentials: mocks.getActiveS3Credentials,
  getSession: mocks.getSession,
  normalizeProjectId: (projectId?: string | null) =>
    projectId?.replace(/-/g, '').toLowerCase() ?? '',
}));

vi.mock('@/lib/s3/client', () => ({
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

vi.mock('@/lib/s3/endpoint', () => ({
  getS3Endpoint: mocks.getS3Endpoint,
  S3_REGION: 'RegionOne',
}));

vi.mock('@/lib/s3/session', () => ({
  ensureActiveProjectS3Credentials:
    mocks.ensureActiveProjectS3Credentials,
}));

import {
  getActiveRoleIamContext,
  roleNameFromArn,
} from '@/lib/s3/iam';
import { S3AuthRequiredError } from '@/lib/s3/client';

const projectId = '7a96a68dc8264f3d84fafd95a72265c5';
const roleArn =
  'arn:aws:iam::RGW08738775184976726:role/service-roles/AssumeRoleSunriseReadWrite';
const credentials = {
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  sessionToken: 'session-token',
  expiration: Date.now() + 3_600_000,
  projectId,
};

describe('roleNameFromArn', () => {
  it('extracts a role name from a Ceph RGW account ARN', () => {
    expect(roleNameFromArn(roleArn)).toBe('AssumeRoleSunriseReadWrite');
  });

  it('extracts a role name from an ARN without a path', () => {
    expect(roleNameFromArn('arn:aws:iam::123456789012:role/ReadOnly')).toBe(
      'ReadOnly'
    );
  });

  it('rejects malformed role ARNs', () => {
    expect(() => roleNameFromArn('arn:aws:s3:::example')).toThrow(
      'Invalid IAM role ARN'
    );
  });
});

describe('getActiveRoleIamContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3Endpoint.mockResolvedValue('https://object.example.test');
  });

  it('selects the RGW role mapped to the normalized active project', async () => {
    const session = {
      projectId: '7A96A68D-C826-4F3D-84FA-FD95A72265C5',
      s3ProjectRoles: { [projectId]: roleArn },
    };
    mocks.getSession.mockResolvedValue(session);
    mocks.getActiveS3Credentials.mockReturnValue(credentials);

    const context = await getActiveRoleIamContext();

    expect(context).toEqual({
      client: mocks.iamClient,
      roleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });
    expect(mocks.getActiveS3Credentials).toHaveBeenCalledWith(session);
    expect(mocks.ensureActiveProjectS3Credentials).not.toHaveBeenCalled();
    expect(mocks.iamClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://object.example.test',
        region: 'RegionOne',
        credentials: {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          sessionToken: 'session-token',
        },
      })
    );
  });

  it('refreshes only the active project credentials when requested', async () => {
    const session = {
      projectId,
      s3ProjectRoles: { [projectId]: roleArn },
    };
    mocks.getSession.mockResolvedValue(session);
    mocks.ensureActiveProjectS3Credentials.mockResolvedValue(credentials);

    await getActiveRoleIamContext({ allowCredentialRefresh: true });

    expect(mocks.ensureActiveProjectS3Credentials).toHaveBeenCalledWith(
      session
    );
    expect(mocks.getActiveS3Credentials).not.toHaveBeenCalled();
  });

  it('allows credential refresh to repopulate a missing role mapping', async () => {
    const session: {
      projectId: string;
      s3ProjectRoles?: Record<string, string>;
    } = { projectId };
    mocks.getSession.mockResolvedValue(session);
    mocks.ensureActiveProjectS3Credentials.mockImplementation(async () => {
      session.s3ProjectRoles = { [projectId]: roleArn };
      return credentials;
    });

    const context = await getActiveRoleIamContext({
      allowCredentialRefresh: true,
    });

    expect(context.roleArn).toBe(roleArn);
    expect(context.roleName).toBe('AssumeRoleSunriseReadWrite');
  });

  it('requires authentication before reporting a missing role mapping', async () => {
    const session = {
      projectId,
      s3ProjectRoles: {},
    };
    mocks.getSession.mockResolvedValue(session);
    mocks.getActiveS3Credentials.mockReturnValue(undefined);

    await expect(getActiveRoleIamContext()).rejects.toBeInstanceOf(
      S3AuthRequiredError
    );
    expect(mocks.getActiveS3Credentials).toHaveBeenCalledWith(session);
  });

  it('rejects valid credentials without an explicit RGW role mapping', async () => {
    mocks.getSession.mockResolvedValue({
      projectId,
      s3ProjectRoles: {},
    });
    mocks.getActiveS3Credentials.mockReturnValue(credentials);

    await expect(getActiveRoleIamContext()).rejects.toThrow(
      `No RGW role ARN found for project ${projectId}`
    );
  });
});
