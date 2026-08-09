import {
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolesCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveRoleIamContext: vi.fn(),
  roleNameFromArn: vi.fn((arn: string) => arn.split('/').at(-1)),
}));

vi.mock('@/lib/s3/iam', () => ({
  getActiveRoleIamContext: mocks.getActiveRoleIamContext,
  roleNameFromArn: mocks.roleNameFromArn,
}));

vi.mock('@/lib/s3/client', () => ({
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import { S3AuthRequiredError } from '@/lib/s3/client';
import {
  getAccessRoleDetails,
  getRoleDetails,
  listRoles,
  listRolesForRender,
} from '@/lib/s3/role-actions';

const activeRoleArn =
  'arn:aws:iam::RGW08738775184976726:role/service-roles/AssumeRoleSunriseReadWrite';

function createClient() {
  return {
    send: vi.fn(),
    destroy: vi.fn(),
  };
}

function accessDeniedError() {
  return Object.assign(new Error('UnknownError'), {
    name: 'AccessDenied',
    Code: 'AccessDenied',
    $metadata: { requestId: 'tx-request-id', httpStatusCode: 403 },
    $response: {
      headers: { server: 'Ceph Object Gateway (tentacle)' },
    },
  });
}

describe('IAM role actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('paginates and maps the roles visible to the active project', async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (!(command instanceof ListRolesCommand)) {
        throw new Error('Unexpected IAM command');
      }
      if (!command.input.Marker) {
        return Promise.resolve({
          Roles: [
            {
              RoleName: 'FirstRole',
              Arn: 'arn:aws:iam::RGW1:role/FirstRole',
              Path: '/service-roles/',
              RoleId: 'role-1',
              Description: 'First role',
              CreateDate: new Date('2026-05-29T12:00:00Z'),
              MaxSessionDuration: 3600,
            },
            { RoleName: 'IncompleteRole' },
          ],
          IsTruncated: true,
          Marker: 'next-page',
        });
      }
      return Promise.resolve({
        Roles: [
          {
            RoleName: 'SecondRole',
            Arn: 'arn:aws:iam::RGW1:role/SecondRole',
          },
        ],
        IsTruncated: false,
      });
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      accessDenied: false,
      roles: [
        {
          name: 'FirstRole',
          arn: 'arn:aws:iam::RGW1:role/FirstRole',
          path: '/service-roles/',
          id: 'role-1',
          description: 'First role',
          createdAt: '2026-05-29T12:00:00.000Z',
          maxSessionDuration: 3600,
        },
        {
          name: 'SecondRole',
          arn: 'arn:aws:iam::RGW1:role/SecondRole',
          path: '/',
          id: null,
          description: null,
          createdAt: null,
          maxSessionDuration: null,
        },
      ],
    });
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(mocks.getActiveRoleIamContext).toHaveBeenCalledWith({
      allowCredentialRefresh: true,
    });
  });

  it('does not refresh credentials during server rendering', async () => {
    const client = createClient();
    client.send.mockResolvedValue({ Roles: [], IsTruncated: false });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    await listRolesForRender();

    expect(mocks.getActiveRoleIamContext).toHaveBeenCalledWith({
      allowCredentialRefresh: false,
    });
  });

  it('turns ListRoles AccessDenied into a restricted empty result', async () => {
    const client = createClient();
    client.send.mockRejectedValue(accessDeniedError());
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      roles: [],
      accessDenied: true,
      denialRequestId: 'tx-request-id',
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('returns complete active-role metadata and policy documents', async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: {
            RoleName: 'AssumeRoleSunriseReadWrite',
            Arn: activeRoleArn,
            Path: '/service-roles/',
            RoleId: 'role-id',
            Description: 'Sunrise access role',
            CreateDate: new Date('2026-05-29T12:00:00Z'),
            MaxSessionDuration: 3600,
            Tags: [
              { Key: 'project-access', Value: 'project:readwrite' },
              { Key: 'ignored-without-value' },
            ],
            AssumeRolePolicyDocument: encodeURIComponent(
              JSON.stringify({ Version: '2012-10-17', Statement: [] })
            ),
          },
        });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({
          PolicyNames: ['S3Access'],
          IsTruncated: false,
        });
      }
      if (command instanceof GetRolePolicyCommand) {
        return Promise.resolve({
          PolicyDocument: encodeURIComponent(
            JSON.stringify({ Statement: [{ Action: 's3:*' }] })
          ),
        });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [
            {
              PolicyName: 'ManagedReadOnly',
              PolicyArn: 'arn:aws:iam::RGW1:policy/ManagedReadOnly',
            },
            { PolicyName: 'IncompletePolicy' },
          ],
          IsTruncated: false,
        });
      }
      throw new Error('Unexpected IAM command');
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected role details');
    expect(result).toMatchObject({
      roleName: 'AssumeRoleSunriseReadWrite',
      roleArn: activeRoleArn,
      path: '/service-roles/',
      id: 'role-id',
      description: 'Sunrise access role',
      createdAt: '2026-05-29T12:00:00.000Z',
      maxSessionDuration: 3600,
      tags: [
        { key: 'project-access', value: 'project:readwrite' },
      ],
      inlinePoliciesAvailable: true,
      attachedPoliciesAvailable: true,
      attachedPolicies: [
        {
          name: 'ManagedReadOnly',
          arn: 'arn:aws:iam::RGW1:policy/ManagedReadOnly',
        },
      ],
      warnings: [],
    });
    expect(JSON.parse(result.assumeRolePolicy ?? '{}')).toEqual({
      Version: '2012-10-17',
      Statement: [],
    });
    expect(result.inlinePolicies).toHaveLength(1);
    expect(JSON.parse(result.inlinePolicies[0].document ?? '{}')).toEqual({
      Statement: [{ Action: 's3:*' }],
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('keeps partial role details and replaces Ceph diagnostics with friendly permission warnings', async () => {
    const client = createClient();
    client.send.mockRejectedValue(accessDeniedError());
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected partial role details');
    expect(result.roleArn).toBe(activeRoleArn);
    expect(result.inlinePoliciesAvailable).toBe(false);
    expect(result.attachedPoliciesAvailable).toBe(false);
    expect(result.warnings).toEqual([
      'You do not have permission to view the assume role policy.',
      'You do not have permission to view inline role policies.',
      'You do not have permission to view attached role policies.',
    ]);
    expect(result.warnings.join(' ')).not.toMatch(
      /UnknownError|tx-request-id|Ceph Object Gateway/
    );
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('uses a friendly error when one inline policy document is denied', async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({ Role: { Arn: activeRoleArn } });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({
          PolicyNames: ['RestrictedPolicy'],
          IsTruncated: false,
        });
      }
      if (command instanceof GetRolePolicyCommand) {
        return Promise.reject(accessDeniedError());
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [],
          IsTruncated: false,
        });
      }
      throw new Error('Unexpected IAM command');
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected role details');
    expect(result.inlinePolicies).toEqual([
      {
        name: 'RestrictedPolicy',
        document: null,
        error: 'You do not have permission to view this policy document.',
      },
    ]);
  });

  it('uses the ARN selected from the roles list for role details', async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        expect(command.input.RoleName).toBe('ListedRole');
        return Promise.resolve({ Role: {} });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: [], IsTruncated: false });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({ AttachedPolicies: [], IsTruncated: false });
      }
      throw new Error('Unexpected IAM command');
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: 'AssumeRoleSunriseReadWrite',
    });
    const listedRoleArn = 'arn:aws:iam::RGW1:role/team/ListedRole';
    mocks.roleNameFromArn.mockReturnValueOnce('ListedRole');

    const result = await getRoleDetails('ListedRole', listedRoleArn);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected role details');
    expect(result.roleName).toBe('ListedRole');
    expect(result.roleArn).toBe(listedRoleArn);
  });

  it('requires S3 authentication when IAM credentials are unavailable', async () => {
    mocks.getActiveRoleIamContext.mockRejectedValue(
      new S3AuthRequiredError()
    );

    await expect(listRoles()).resolves.toEqual({
      ok: false,
      needsAuth: true,
    });
    await expect(getAccessRoleDetails()).resolves.toEqual({
      ok: false,
      needsAuth: true,
    });
  });
});
