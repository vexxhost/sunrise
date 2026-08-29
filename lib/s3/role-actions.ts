'use server';

import {
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolesCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { S3AuthRequiredError } from '@/lib/s3/client';
import { roleNameFromArn } from '@/lib/s3/arn';
import { getActiveRoleIamContext } from '@/lib/s3/iam';

export type IamRoleSummary = {
  name: string;
  arn: string;
  path: string;
  id: string | null;
  description: string | null;
  createdAt: string | null;
  maxSessionDuration: number | null;
};

export type ListRolesResult =
  | {
      ok: true;
      roles: IamRoleSummary[];
      accessDenied: boolean;
      denialRequestId?: string;
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

export type InlineRolePolicy = {
  name: string;
  document: string | null;
  error?: string;
};

export type AttachedRolePolicy = {
  name: string;
  arn: string;
};

export type IamRoleTag = {
  key: string;
  value: string;
};

export type AccessRoleDetailsResult =
  | {
      ok: true;
      roleName: string;
      roleArn: string;
      path: string | null;
      id: string | null;
      description: string | null;
      createdAt: string | null;
      maxSessionDuration: number | null;
      tags: IamRoleTag[];
      assumeRolePolicy: string | null;
      inlinePoliciesAvailable: boolean;
      inlinePolicies: InlineRolePolicy[];
      attachedPoliciesAvailable: boolean;
      attachedPolicies: AttachedRolePolicy[];
      warnings: string[];
    }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

type AwsServiceError = Error & {
  Code?: string;
  code?: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    extendedRequestId?: string;
  };
  $response?: {
    headers?: Record<string, string | string[] | undefined>;
  };
};

function asAwsServiceError(error: unknown): AwsServiceError | null {
  return error instanceof Error ? (error as AwsServiceError) : null;
}

function getAwsRequestId(error: unknown): string | undefined {
  const awsError = asAwsServiceError(error);
  if (!awsError) return undefined;

  const headerRequestId = awsError.$response?.headers?.['x-amz-request-id'];
  return (
    awsError.$metadata?.requestId ??
    awsError.$metadata?.extendedRequestId ??
    (Array.isArray(headerRequestId) ? headerRequestId[0] : headerRequestId)
  );
}

function getAwsServer(error: unknown): string | undefined {
  const server = asAwsServiceError(error)?.$response?.headers?.server;
  return Array.isArray(server) ? server[0] : server;
}

function describeAwsError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const awsError = error as AwsServiceError;
  const code = awsError.Code ?? awsError.$metadata?.httpStatusCode;
  const requestId = getAwsRequestId(error);
  const server = getAwsServer(error);
  return `${awsError.name || 'Error'}${code ? ` (${code})` : ''}: ${awsError.message}${requestId ? ` [request ${requestId}]` : ''}${server ? ` [server ${server}]` : ''}`;
}

function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const awsError = error as AwsServiceError;
  return (
    awsError.name === 'AccessDenied' ||
    awsError.name === 'AccessDeniedException' ||
    awsError.Code === 'AccessDenied' ||
    awsError.Code === 'AccessDeniedException' ||
    awsError.code === 'AccessDenied' ||
    awsError.code === 'AccessDeniedException' ||
    awsError.$metadata?.httpStatusCode === 403
  );
}

function describeRoleDetailError(
  error: unknown,
  accessDeniedMessage: string
): string {
  return isAccessDeniedError(error)
    ? accessDeniedMessage
    : describeAwsError(error);
}

function roleDetailWarning(
  operation: string,
  accessDeniedMessage: string,
  error: unknown
): string {
  console.warn(`[s3/getRoleDetails] ${operation}:`, describeAwsError(error));
  return isAccessDeniedError(error)
    ? accessDeniedMessage
    : `${operation}: ${describeAwsError(error)}`;
}

function formatPolicyDocument(document?: string): string | null {
  if (!document) return null;

  const candidates = [document];
  try {
    const decoded = decodeURIComponent(document.replace(/\+/g, ' '));
    if (decoded !== document) candidates.push(decoded);
  } catch {
    // Keep the original response if it was not URL encoded.
  }

  for (const candidate of candidates) {
    try {
      return JSON.stringify(JSON.parse(candidate), null, 2);
    } catch {
      // Try the next representation.
    }
  }

  return candidates.at(-1) ?? document;
}

async function listRolesWithCredentialRefresh(
  allowCredentialRefresh: boolean
): Promise<ListRolesResult> {
  try {
    const { client } = await getActiveRoleIamContext({
      allowCredentialRefresh,
    });
    const roles: IamRoleSummary[] = [];

    try {
      let marker: string | undefined;
      do {
        const response = await client.send(
          new ListRolesCommand({ Marker: marker })
        );
        for (const role of response.Roles ?? []) {
          if (!role.RoleName || !role.Arn) continue;
          roles.push({
            name: role.RoleName,
            arn: role.Arn,
            path: role.Path ?? '/',
            id: role.RoleId ?? null,
            description: role.Description ?? null,
            createdAt: role.CreateDate?.toISOString() ?? null,
            maxSessionDuration: role.MaxSessionDuration ?? null,
          });
        }
        marker = response.IsTruncated ? response.Marker : undefined;
      } while (marker);

      return { ok: true, roles, accessDenied: false };
    } catch (error) {
      if (isAccessDeniedError(error)) {
        console.warn('[s3/listRoles] ACCESS DENIED:', describeAwsError(error));
        return {
          ok: true,
          roles: [],
          accessDenied: true,
          denialRequestId: getAwsRequestId(error),
        };
      }
      throw error;
    } finally {
      client.destroy();
    }
  } catch (error) {
    if (error instanceof S3AuthRequiredError) {
      return { ok: false, needsAuth: true };
    }

    const detail = describeAwsError(error);
    console.error('[s3/listRoles] FAILED:', detail, error);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export async function listRoles(): Promise<ListRolesResult> {
  return listRolesWithCredentialRefresh(true);
}

export async function listRolesForRender(): Promise<ListRolesResult> {
  return listRolesWithCredentialRefresh(false);
}

async function readRoleDetails(
  requestedRoleName?: string,
  knownRoleArn?: string
): Promise<AccessRoleDetailsResult> {
  try {
    const context = await getActiveRoleIamContext({
      allowCredentialRefresh: true,
    });
    const { client } = context;
    try {
      const roleName = requestedRoleName?.trim() || context.roleName;
      let roleArn = roleName === context.roleName ? context.roleArn : '';

      if (knownRoleArn && roleNameFromArn(knownRoleArn) === roleName) {
        roleArn = knownRoleArn;
      }

      const warnings: string[] = [];
      let path: string | null = null;
      let id: string | null = null;
      let description: string | null = null;
      let createdAt: string | null = null;
      let maxSessionDuration: number | null = null;
      let tags: IamRoleTag[] = [];
      let assumeRolePolicy: string | null = null;
      let inlinePoliciesAvailable = false;
      const inlinePolicies: InlineRolePolicy[] = [];
      let attachedPoliciesAvailable = false;
      const attachedPolicies: AttachedRolePolicy[] = [];

      try {
        const response = await client.send(
          new GetRoleCommand({ RoleName: roleName })
        );
        roleArn = response.Role?.Arn ?? roleArn;
        path = response.Role?.Path ?? null;
        id = response.Role?.RoleId ?? null;
        description = response.Role?.Description ?? null;
        createdAt = response.Role?.CreateDate?.toISOString() ?? null;
        maxSessionDuration = response.Role?.MaxSessionDuration ?? null;
        tags = (response.Role?.Tags ?? []).flatMap((tag) =>
          tag.Key !== undefined && tag.Value !== undefined
            ? [{ key: tag.Key, value: tag.Value }]
            : []
        );
        assumeRolePolicy = formatPolicyDocument(
          response.Role?.AssumeRolePolicyDocument
        );
      } catch (error) {
        warnings.push(
          roleDetailWarning(
            'Unable to read assume role policy',
            'You do not have permission to view the assume role policy.',
            error
          )
        );
      }

      try {
        let marker: string | undefined;
        const policyNames: string[] = [];

        do {
          const response = await client.send(
            new ListRolePoliciesCommand({ RoleName: roleName, Marker: marker })
          );
          policyNames.push(...(response.PolicyNames ?? []));
          marker = response.IsTruncated ? response.Marker : undefined;
        } while (marker);

        inlinePoliciesAvailable = true;

        for (const policyName of policyNames) {
          try {
            const response = await client.send(
              new GetRolePolicyCommand({
                RoleName: roleName,
                PolicyName: policyName,
              })
            );
            inlinePolicies.push({
              name: policyName,
              document: formatPolicyDocument(response.PolicyDocument),
            });
          } catch (error) {
            console.warn(
              `[s3/getRoleDetails] Unable to read inline role policy ${policyName}:`,
              describeAwsError(error)
            );
            inlinePolicies.push({
              name: policyName,
              document: null,
              error: describeRoleDetailError(
                error,
                'You do not have permission to view this policy document.'
              ),
            });
          }
        }
      } catch (error) {
        warnings.push(
          roleDetailWarning(
            'Unable to list inline role policies',
            'You do not have permission to view inline role policies.',
            error
          )
        );
      }

      try {
        let marker: string | undefined;
        do {
          const response = await client.send(
            new ListAttachedRolePoliciesCommand({
              RoleName: roleName,
              Marker: marker,
            })
          );
          for (const policy of response.AttachedPolicies ?? []) {
            if (policy.PolicyName && policy.PolicyArn) {
              attachedPolicies.push({
                name: policy.PolicyName,
                arn: policy.PolicyArn,
              });
            }
          }
          marker = response.IsTruncated ? response.Marker : undefined;
        } while (marker);
        attachedPoliciesAvailable = true;
      } catch (error) {
        warnings.push(
          roleDetailWarning(
            'Unable to list attached role policies',
            'You do not have permission to view attached role policies.',
            error
          )
        );
      }

      if (!roleArn) {
        throw new Error(`Unable to resolve ARN for IAM role ${roleName}`);
      }

      return {
        ok: true,
        roleName,
        roleArn,
        path,
        id,
        description,
        createdAt,
        maxSessionDuration,
        tags,
        assumeRolePolicy,
        inlinePoliciesAvailable,
        inlinePolicies,
        attachedPoliciesAvailable,
        attachedPolicies,
        warnings,
      };
    } finally {
      client.destroy();
    }
  } catch (error) {
    if (error instanceof S3AuthRequiredError) {
      return { ok: false, needsAuth: true };
    }

    const detail = describeAwsError(error);
    console.error('[s3/getRoleDetails] FAILED:', detail, error);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export async function getAccessRoleDetails(): Promise<AccessRoleDetailsResult> {
  return readRoleDetails();
}

export async function getRoleDetails(
  roleName: string,
  roleArn: string
): Promise<AccessRoleDetailsResult> {
  return readRoleDetails(roleName, roleArn);
}
