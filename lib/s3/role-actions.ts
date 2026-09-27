"use server";

import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolesCommand,
  ListRolePoliciesCommand,
  PutRolePolicyCommand,
  TagRoleCommand,
  UpdateAssumeRolePolicyCommand,
  UpdateRoleCommand,
  type IAMClient,
} from "@aws-sdk/client-iam";
import {
  validateIamPermissionPolicyJson,
  validateIamTrustPolicyJson,
} from "@/lib/json-document";
import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  mutationSuccess,
  type MutationError,
  type MutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { S3AuthRequiredError } from "@/lib/s3/client";
import { roleNameFromArn } from "@/lib/s3/arn";
import { getActiveRoleIamContext } from "@/lib/s3/iam";
import {
  listRoleTagsWithCephCompatibility,
  untagRoleWithCephCompatibility,
} from "@/lib/s3/iam-role-tags";
import {
  isSupportedRgwManagedPolicy,
  validateIamPolicyName,
  validateIamRoleDescription,
  validateIamRoleName,
  validateIamRolePath,
  validateIamRoleTags,
  validateIamSessionDuration,
} from "@/lib/s3/role-policy";

export type IamRoleSummary = {
  name: string;
  arn: string;
  path: string;
  id: string | null;
  description: string | null;
  createdAt: string | null;
  maxSessionDuration: number | null;
  isActive: boolean;
};

export type ListRolesResult =
  | {
      ok: true;
      roles: IamRoleSummary[];
      activeRoleArn: string;
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
      tagsAvailable: boolean;
      tags: IamRoleTag[];
      assumeRolePolicy: string | null;
      inlinePoliciesAvailable: boolean;
      inlinePolicies: InlineRolePolicy[];
      attachedPoliciesAvailable: boolean;
      attachedPolicies: AttachedRolePolicy[];
      warnings: string[];
      isActiveRole: boolean;
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

export type CreateIamRoleInput = {
  name: string;
  path: string;
  description: string;
  maxSessionDuration: number;
  assumeRolePolicy: string;
  tags: IamRoleTag[];
};

type PreparedIamMutation =
  | {
      ok: true;
      client: IAMClient;
      scope: MutationScope;
      activeRoleName: string;
    }
  | { ok: false; result: MutationFailure };

function asAwsServiceError(error: unknown): AwsServiceError | null {
  return error instanceof Error ? (error as AwsServiceError) : null;
}

function getAwsRequestId(error: unknown): string | undefined {
  const awsError = asAwsServiceError(error);
  if (!awsError) return undefined;

  const headerRequestId = awsError.$response?.headers?.["x-amz-request-id"];
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
  return `${awsError.name || "Error"}${code ? ` (${code})` : ""}: ${awsError.message}${requestId ? ` [request ${requestId}]` : ""}${server ? ` [server ${server}]` : ""}`;
}

function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const awsError = error as AwsServiceError;
  return (
    awsError.name === "AccessDenied" ||
    awsError.name === "AccessDeniedException" ||
    awsError.Code === "AccessDenied" ||
    awsError.Code === "AccessDeniedException" ||
    awsError.code === "AccessDenied" ||
    awsError.code === "AccessDeniedException" ||
    awsError.$metadata?.httpStatusCode === 403
  );
}

function describeRoleDetailError(
  error: unknown,
  accessDeniedMessage: string,
): string {
  return isAccessDeniedError(error)
    ? accessDeniedMessage
    : describeAwsError(error);
}

function roleDetailWarning(
  operation: string,
  accessDeniedMessage: string,
  error: unknown,
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
    const decoded = decodeURIComponent(document.replace(/\+/g, " "));
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

async function listIamRoleTags(client: IAMClient, roleName: string) {
  const tags: IamRoleTag[] = [];
  let marker: string | undefined;

  do {
    const response = await listRoleTagsWithCephCompatibility(client, {
      RoleName: roleName,
      Marker: marker,
    });
    tags.push(
      ...(response.Tags ?? []).flatMap((tag) =>
        tag.Key !== undefined && tag.Value !== undefined
          ? [{ key: tag.Key, value: tag.Value }]
          : [],
      ),
    );
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return tags;
}

async function listRolesWithCredentialRefresh(
  allowCredentialRefresh: boolean,
): Promise<ListRolesResult> {
  try {
    const { client, roleArn: activeRoleArn } = await getActiveRoleIamContext({
      allowCredentialRefresh,
    });
    const roles: IamRoleSummary[] = [];

    try {
      let marker: string | undefined;
      do {
        const response = await client.send(
          new ListRolesCommand({ Marker: marker }),
        );
        for (const role of response.Roles ?? []) {
          if (!role.RoleName || !role.Arn) continue;
          roles.push({
            name: role.RoleName,
            arn: role.Arn,
            path: role.Path ?? "/",
            id: role.RoleId ?? null,
            description: role.Description ?? null,
            createdAt: role.CreateDate?.toISOString() ?? null,
            maxSessionDuration: role.MaxSessionDuration ?? null,
            isActive: role.Arn === activeRoleArn,
          });
        }
        marker = response.IsTruncated ? response.Marker : undefined;
      } while (marker);

      return {
        ok: true,
        roles,
        activeRoleArn,
        accessDenied: false,
      };
    } catch (error) {
      if (isAccessDeniedError(error)) {
        console.warn("[s3/listRoles] ACCESS DENIED:", describeAwsError(error));
        return {
          ok: true,
          roles: [],
          activeRoleArn,
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
    console.error("[s3/listRoles] FAILED:", detail, error);
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
  knownRoleArn?: string,
): Promise<AccessRoleDetailsResult> {
  try {
    const context = await getActiveRoleIamContext({
      allowCredentialRefresh: true,
    });
    const { client } = context;
    try {
      const roleName = requestedRoleName?.trim() || context.roleName;
      let roleArn = roleName === context.roleName ? context.roleArn : "";

      if (knownRoleArn && roleNameFromArn(knownRoleArn) === roleName) {
        roleArn = knownRoleArn;
      }

      const warnings: string[] = [];
      let path: string | null = null;
      let id: string | null = null;
      let description: string | null = null;
      let createdAt: string | null = null;
      let maxSessionDuration: number | null = null;
      let tagsAvailable = false;
      let tags: IamRoleTag[] = [];
      let assumeRolePolicy: string | null = null;
      let inlinePoliciesAvailable = false;
      const inlinePolicies: InlineRolePolicy[] = [];
      let attachedPoliciesAvailable = false;
      const attachedPolicies: AttachedRolePolicy[] = [];

      try {
        const response = await client.send(
          new GetRoleCommand({ RoleName: roleName }),
        );
        roleArn = response.Role?.Arn ?? roleArn;
        path = response.Role?.Path ?? null;
        id = response.Role?.RoleId ?? null;
        description = response.Role?.Description ?? null;
        createdAt = response.Role?.CreateDate?.toISOString() ?? null;
        maxSessionDuration = response.Role?.MaxSessionDuration ?? null;
        tags = normalizeRoleTags(
          (response.Role?.Tags ?? []).flatMap((tag) =>
            tag.Key !== undefined && tag.Value !== undefined
              ? [{ key: tag.Key, value: tag.Value }]
              : [],
          ),
        );
        tagsAvailable = true;
        assumeRolePolicy = formatPolicyDocument(
          response.Role?.AssumeRolePolicyDocument,
        );
      } catch (error) {
        warnings.push(
          roleDetailWarning(
            "Unable to read assume role policy",
            "You do not have permission to view the assume role policy.",
            error,
          ),
        );
      }

      try {
        tags = normalizeRoleTags(await listIamRoleTags(client, roleName));
        tagsAvailable = true;
      } catch (error) {
        if (!tagsAvailable) {
          warnings.push(
            roleDetailWarning(
              "Unable to list role tags",
              "You do not have permission to view role tags.",
              error,
            ),
          );
        }
      }

      try {
        let marker: string | undefined;
        const policyNames: string[] = [];

        do {
          const response = await client.send(
            new ListRolePoliciesCommand({ RoleName: roleName, Marker: marker }),
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
              }),
            );
            inlinePolicies.push({
              name: policyName,
              document: formatPolicyDocument(response.PolicyDocument),
            });
          } catch (error) {
            console.warn(
              `[s3/getRoleDetails] Unable to read inline role policy ${policyName}:`,
              describeAwsError(error),
            );
            inlinePolicies.push({
              name: policyName,
              document: null,
              error: describeRoleDetailError(
                error,
                "You do not have permission to view this policy document.",
              ),
            });
          }
        }
      } catch (error) {
        warnings.push(
          roleDetailWarning(
            "Unable to list inline role policies",
            "You do not have permission to view inline role policies.",
            error,
          ),
        );
      }

      try {
        let marker: string | undefined;
        do {
          const response = await client.send(
            new ListAttachedRolePoliciesCommand({
              RoleName: roleName,
              Marker: marker,
            }),
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
            "Unable to list attached role policies",
            "You do not have permission to view attached role policies.",
            error,
          ),
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
        tagsAvailable,
        tags,
        assumeRolePolicy,
        inlinePoliciesAvailable,
        inlinePolicies,
        attachedPoliciesAvailable,
        attachedPolicies,
        warnings,
        isActiveRole:
          roleName === context.roleName || roleArn === context.roleArn,
      };
    } finally {
      client.destroy();
    }
  } catch (error) {
    if (error instanceof S3AuthRequiredError) {
      return { ok: false, needsAuth: true };
    }

    const detail = describeAwsError(error);
    console.error("[s3/getRoleDetails] FAILED:", detail, error);
    return { ok: false, needsAuth: false, error: detail };
  }
}

export async function getAccessRoleDetails(): Promise<AccessRoleDetailsResult> {
  return readRoleDetails();
}

export async function getRoleDetails(
  roleName: string,
  roleArn: string,
): Promise<AccessRoleDetailsResult> {
  return readRoleDetails(roleName, roleArn);
}

function iamErrorName(error: unknown) {
  const awsError = asAwsServiceError(error);
  return awsError?.name || awsError?.Code || awsError?.code || "UnknownError";
}

function iamErrorStatus(error: unknown) {
  return asAwsServiceError(error)?.$metadata?.httpStatusCode;
}

function iamMutationError(
  error: unknown,
  actionLabel: string,
  conflictMessage?: string,
): MutationError {
  const name = iamErrorName(error);
  const status = iamErrorStatus(error);
  const requestId = getAwsRequestId(error);

  if (name === "EntityAlreadyExists") {
    return {
      code: "conflict",
      message:
        conflictMessage ?? "An IAM resource with this name already exists.",
      requestId,
      retryable: false,
      status: status ?? 409,
    };
  }
  if (name === "DeleteConflict") {
    return {
      code: "conflict",
      message:
        conflictMessage ??
        "Remove inline policies and detach managed policies before deleting this role.",
      requestId,
      retryable: false,
      status: status ?? 409,
    };
  }
  if (name === "ConcurrentModification") {
    return {
      code: "conflict",
      message: "The role changed during this operation. Refresh and try again.",
      requestId,
      retryable: true,
      status: status ?? 409,
    };
  }
  if (name === "NoSuchEntity") {
    return {
      code: "not-found",
      message: "The IAM role or policy no longer exists in this RGW account.",
      requestId,
      retryable: false,
      status: status ?? 404,
    };
  }
  if (name === "MalformedPolicyDocument" || name === "ValidationError") {
    return {
      code: "validation-failed",
      message: `RGW rejected the request to ${actionLabel}. Review the role and policy values.`,
      requestId,
      retryable: false,
      status: status ?? 400,
    };
  }
  if (status) return mutationErrorForStatus(status, actionLabel, requestId);

  return {
    code: "network-error",
    message: "Object Storage IAM could not be reached. Try again shortly.",
    requestId,
    retryable: true,
  };
}

async function prepareIamMutation(
  expectedScope: MutationScope,
): Promise<PreparedIamMutation> {
  const guarded = await guardMutationContext(expectedScope, {
    requireProjectToken: false,
  });
  if (!guarded.ok) return { ok: false, result: guarded.result };

  try {
    const context = await getActiveRoleIamContext({
      allowCredentialRefresh: true,
    });
    return {
      ok: true,
      client: context.client,
      scope: guarded.context.scope,
      activeRoleName: context.roleName,
    };
  } catch (error) {
    return {
      ok: false,
      result: mutationFailure(
        error instanceof S3AuthRequiredError
          ? {
              code: "authentication-required",
              message:
                "Your Object Storage session expired. Sign in and try again.",
              retryable: true,
            }
          : {
              code: "network-error",
              message:
                "Object Storage IAM could not be reached. Try again shortly.",
              retryable: true,
            },
        guarded.context.scope,
      ),
    };
  }
}

function roleValidationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    {
      code: "validation-failed",
      message,
      retryable: false,
    },
    scope,
  );
}

function mutableRoleError(roleName: string, activeRoleName: string) {
  const normalizedRoleName = roleName.trim();
  return (
    validateIamRoleName(normalizedRoleName) ??
    (normalizedRoleName === activeRoleName
      ? "The current access role cannot be changed from its own Sunrise session."
      : null)
  );
}

function compactTrustPolicy(document: string) {
  const result = validateIamTrustPolicyJson(document);
  return result.ok
    ? { ok: true as const, value: JSON.stringify(result.value) }
    : { ok: false as const, message: result.errors.join(" ") };
}

function compactPermissionPolicy(document: string) {
  const result = validateIamPermissionPolicyJson(document);
  return result.ok
    ? { ok: true as const, value: JSON.stringify(result.value) }
    : { ok: false as const, message: result.errors.join(" ") };
}

function roleTagMap(tags: IamRoleTag[]) {
  return new Map(tags.map((tag) => [tag.key, tag.value]));
}

function normalizeRoleTags(tags: IamRoleTag[]) {
  return [...roleTagMap(tags)].map(([key, value]) => ({ key, value }));
}

function haveEqualRoleTags(left: IamRoleTag[], right: IamRoleTag[]) {
  const leftMap = roleTagMap(left);
  const rightMap = roleTagMap(right);
  if (
    leftMap.size !== left.length ||
    rightMap.size !== right.length ||
    leftMap.size !== rightMap.size
  ) {
    return false;
  }
  return [...leftMap].every(([key, value]) => rightMap.get(key) === value);
}

export async function createIamRole(
  expectedScope: MutationScope,
  input: CreateIamRoleInput,
): Promise<MutationResult<{ roleName: string; roleArn: string | null }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;

  const name = input.name.trim();
  const path = input.path.trim();
  const description = input.description.trim();
  const tags = input.tags.map((tag) => ({
    key: tag.key.trim(),
    value: tag.value.trim(),
  }));
  const validationError =
    validateIamRoleName(name) ??
    validateIamRolePath(path) ??
    validateIamRoleDescription(description) ??
    validateIamSessionDuration(input.maxSessionDuration) ??
    validateIamRoleTags(tags);
  const trustPolicy = compactTrustPolicy(input.assumeRolePolicy);
  const errorMessage =
    validationError ?? (trustPolicy.ok ? null : trustPolicy.message);
  if (errorMessage) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, errorMessage);
  }

  try {
    const response = await prepared.client.send(
      new CreateRoleCommand({
        RoleName: name,
        Path: path,
        Description: description || undefined,
        MaxSessionDuration: input.maxSessionDuration,
        AssumeRolePolicyDocument: trustPolicy.value,
        Tags:
          tags.length > 0
            ? tags.map((tag) => ({ Key: tag.key, Value: tag.value }))
            : undefined,
      }),
    );
    return mutationSuccess({
      data: { roleName: name, roleArn: response.Role?.Arn ?? null },
      message: `Role ${name} was created.`,
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(
        error,
        "create this role",
        "A role with this name already exists in the active RGW account.",
      ),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function updateIamRoleSessionDuration(
  expectedScope: MutationScope,
  roleName: string,
  maxSessionDuration: number,
): Promise<MutationResult<{ roleName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const validationError =
    mutableRoleError(roleName, prepared.activeRoleName) ??
    validateIamSessionDuration(maxSessionDuration);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    await prepared.client.send(
      new UpdateRoleCommand({
        RoleName: roleName.trim(),
        MaxSessionDuration: maxSessionDuration,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim() },
      message: "Maximum session duration saved.",
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "update this role"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function updateIamRoleTags(
  expectedScope: MutationScope,
  roleName: string,
  tags: IamRoleTag[],
): Promise<MutationResult<{ roleName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const normalizedRoleName = roleName.trim();
  const normalizedTags = tags.map((tag) => ({
    key: tag.key.trim(),
    value: tag.value.trim(),
  }));
  const validationError =
    mutableRoleError(normalizedRoleName, prepared.activeRoleName) ??
    validateIamRoleTags(normalizedTags);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    const currentTags = await listIamRoleTags(
      prepared.client,
      normalizedRoleName,
    );
    const currentByKey = roleTagMap(currentTags);
    const desiredByKey = roleTagMap(normalizedTags);
    const currentKeyCounts = currentTags.reduce((counts, tag) => {
      counts.set(tag.key, (counts.get(tag.key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const changedKeys = new Set(
      [...currentByKey.keys(), ...desiredByKey.keys()].filter(
        (key) =>
          currentKeyCounts.get(key) !== 1 ||
          currentByKey.get(key) !== desiredByKey.get(key),
      ),
    );
    const keysToRemove = [...changedKeys].filter((key) =>
      currentByKey.has(key),
    );
    const tagsToAdd = normalizedTags.filter((tag) => changedKeys.has(tag.key));

    if (keysToRemove.length > 0) {
      await untagRoleWithCephCompatibility(
        prepared.client,
        normalizedRoleName,
        keysToRemove,
      );
    }
    if (tagsToAdd.length > 0) {
      await prepared.client.send(
        new TagRoleCommand({
          RoleName: normalizedRoleName,
          Tags: tagsToAdd.map((tag) => ({ Key: tag.key, Value: tag.value })),
        }),
      );
    }

    if (changedKeys.size > 0) {
      const persistedTags = await listIamRoleTags(
        prepared.client,
        normalizedRoleName,
      );
      if (!haveEqualRoleTags(persistedTags, normalizedTags)) {
        return mutationFailure(
          {
            code: "invalid-response",
            message:
              "RGW accepted the tag update, but the saved role tags do not match. Refresh and try again. If this continues, check RGW IAM role-tag support.",
            retryable: true,
          },
          prepared.scope,
        );
      }
    }

    return mutationSuccess({
      data: { roleName: normalizedRoleName },
      message: "Role tags saved.",
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "save these role tags"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function updateIamRoleTrustPolicy(
  expectedScope: MutationScope,
  roleName: string,
  policyDocument: string,
): Promise<MutationResult<{ roleName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const validationError = mutableRoleError(roleName, prepared.activeRoleName);
  const policy = compactTrustPolicy(policyDocument);
  const errorMessage = validationError ?? (policy.ok ? null : policy.message);
  if (errorMessage) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, errorMessage);
  }

  try {
    await prepared.client.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: roleName.trim(),
        PolicyDocument: policy.value,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim() },
      message: "Trust policy saved.",
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "update this trust policy"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function putIamInlineRolePolicy(
  expectedScope: MutationScope,
  roleName: string,
  policyName: string,
  policyDocument: string,
): Promise<MutationResult<{ roleName: string; policyName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const normalizedPolicyName = policyName.trim();
  const validationError =
    mutableRoleError(roleName, prepared.activeRoleName) ??
    validateIamPolicyName(normalizedPolicyName);
  const policy = compactPermissionPolicy(policyDocument);
  const errorMessage = validationError ?? (policy.ok ? null : policy.message);
  if (errorMessage) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, errorMessage);
  }

  try {
    await prepared.client.send(
      new PutRolePolicyCommand({
        RoleName: roleName.trim(),
        PolicyName: normalizedPolicyName,
        PolicyDocument: policy.value,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim(), policyName: normalizedPolicyName },
      message: `Inline policy ${normalizedPolicyName} was saved.`,
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "save this inline policy"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function deleteIamInlineRolePolicy(
  expectedScope: MutationScope,
  roleName: string,
  policyName: string,
): Promise<MutationResult<{ roleName: string; policyName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const normalizedPolicyName = policyName.trim();
  const validationError =
    mutableRoleError(roleName, prepared.activeRoleName) ??
    validateIamPolicyName(normalizedPolicyName);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    await prepared.client.send(
      new DeleteRolePolicyCommand({
        RoleName: roleName.trim(),
        PolicyName: normalizedPolicyName,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim(), policyName: normalizedPolicyName },
      message: `Inline policy ${normalizedPolicyName} was deleted.`,
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "delete this inline policy"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function attachIamManagedRolePolicy(
  expectedScope: MutationScope,
  roleName: string,
  policyArn: string,
): Promise<MutationResult<{ roleName: string; policyArn: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const validationError =
    mutableRoleError(roleName, prepared.activeRoleName) ??
    (!isSupportedRgwManagedPolicy(policyArn)
      ? "Select a managed policy supported by Ceph RGW."
      : null);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    await prepared.client.send(
      new AttachRolePolicyCommand({
        RoleName: roleName.trim(),
        PolicyArn: policyArn,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim(), policyArn },
      message: "Managed policy attached.",
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "attach this managed policy"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function detachIamManagedRolePolicy(
  expectedScope: MutationScope,
  roleName: string,
  policyArn: string,
): Promise<MutationResult<{ roleName: string; policyArn: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const normalizedPolicyArn = policyArn.trim();
  const validationError =
    mutableRoleError(roleName, prepared.activeRoleName) ??
    (!normalizedPolicyArn ? "Select an attached managed policy." : null);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    await prepared.client.send(
      new DetachRolePolicyCommand({
        RoleName: roleName.trim(),
        PolicyArn: normalizedPolicyArn,
      }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim(), policyArn: normalizedPolicyArn },
      message: "Managed policy detached.",
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(error, "detach this managed policy"),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}

export async function deleteIamRole(
  expectedScope: MutationScope,
  roleName: string,
): Promise<MutationResult<{ roleName: string }>> {
  const prepared = await prepareIamMutation(expectedScope);
  if (!prepared.ok) return prepared.result;
  const validationError = mutableRoleError(roleName, prepared.activeRoleName);
  if (validationError) {
    prepared.client.destroy();
    return roleValidationFailure(prepared.scope, validationError);
  }

  try {
    await prepared.client.send(
      new DeleteRoleCommand({ RoleName: roleName.trim() }),
    );
    return mutationSuccess({
      data: { roleName: roleName.trim() },
      message: `Role ${roleName.trim()} was deleted.`,
      scope: prepared.scope,
    });
  } catch (error) {
    return mutationFailure(
      iamMutationError(
        error,
        "delete this role",
        "Remove inline policies and detach managed policies before deleting this role.",
      ),
      prepared.scope,
    );
  } finally {
    prepared.client.destroy();
  }
}
