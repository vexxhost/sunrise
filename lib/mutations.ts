import type { CloudContextSnapshot } from "@/lib/cloud-context-snapshot";
import type { ServiceDirectoryId } from "@/lib/openstack/service-directory";

export type MutationScope = {
  projectId: string;
  regionId?: string;
};

export type MutationErrorCode =
  | "authentication-required"
  | "context-changed"
  | "service-unavailable"
  | "permission-denied"
  | "validation-failed"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "service-error"
  | "network-error"
  | "invalid-response"
  | "unknown";

export type MutationError = {
  code: MutationErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
  status?: number;
};

export type MutationIssue = {
  message: string;
  resource?: string;
};

export type MutationResult<T = undefined> =
  | {
      ok: true;
      status: "success" | "partial";
      data: T;
      message: string;
      issues?: MutationIssue[];
      requestId?: string;
      scope: MutationScope;
    }
  | {
      ok: false;
      status: "error";
      error: MutationError;
      scope?: MutationScope;
    };

export type MutationFailure = Extract<MutationResult<never>, { ok: false }>;

export type MutationCapability = {
  status: "available" | "unavailable" | "unknown";
  permission: "granted" | "denied" | "unknown";
  message: string;
};

export function retainFailedTargets<T>(
  targets: readonly T[],
  results: readonly { ok: boolean }[],
) {
  return targets.filter((_, index) => !results[index]?.ok);
}

type CapabilityOptions = {
  serviceId: ServiceDirectoryId;
  permission?: MutationCapability["permission"];
  requireRegion?: boolean;
};

export function normalizeMutationProjectId(value?: string | null) {
  return value?.replace(/-/g, "").toLowerCase() ?? "";
}

export function mutationScopeError(
  active: MutationScope,
  expected: MutationScope,
  requireRegion = true,
): MutationError | null {
  if (
    !normalizeMutationProjectId(expected.projectId) ||
    !normalizeMutationProjectId(active.projectId)
  ) {
    return {
      code: "validation-failed",
      message: "Select a project before changing cloud resources.",
      retryable: false,
    };
  }

  if (
    normalizeMutationProjectId(active.projectId) !==
    normalizeMutationProjectId(expected.projectId)
  ) {
    return {
      code: "context-changed",
      message:
        "The active project changed while this page was open. Review the new project and try again.",
      retryable: true,
    };
  }

  if (requireRegion && (!active.regionId || !expected.regionId)) {
    return {
      code: "validation-failed",
      message: "Select a region before changing cloud resources.",
      retryable: false,
    };
  }

  if (
    requireRegion &&
    active.regionId?.toLowerCase() !== expected.regionId?.toLowerCase()
  ) {
    return {
      code: "context-changed",
      message:
        "The active region changed while this page was open. Review the new region and try again.",
      retryable: true,
    };
  }

  return null;
}

export function resolveMutationCapability(
  context: CloudContextSnapshot,
  {
    serviceId,
    permission = "unknown",
    requireRegion = true,
  }: CapabilityOptions,
): MutationCapability {
  if (!context.project.id) {
    return {
      status: "unavailable",
      permission,
      message: "Select a project to use this action.",
    };
  }

  if (requireRegion && !context.region.id) {
    return {
      status: "unavailable",
      permission,
      message: "Select a region to use this action.",
    };
  }

  const service = context.services.find(({ id }) => id === serviceId);
  if (!service || service.status === "unavailable") {
    return {
      status: "unavailable",
      permission,
      message: service?.message ?? "This service is not available.",
    };
  }

  if (permission === "denied") {
    return {
      status: "unavailable",
      permission,
      message: "Your current role does not permit this action.",
    };
  }

  if (service.status === "unknown") {
    return {
      status: "unknown",
      permission,
      message: service.message,
    };
  }

  return {
    status: "available",
    permission,
    message:
      permission === "granted"
        ? "This action is available."
        : "Availability is confirmed; permission will be verified by the service.",
  };
}

export function mutationErrorForStatus(
  status: number,
  actionLabel: string,
  requestId?: string,
): MutationError {
  const base = { status, requestId };

  if (status === 401) {
    return {
      ...base,
      code: "authentication-required",
      message: "Your cloud session expired. Sign in and try again.",
      retryable: true,
    };
  }
  if (status === 403) {
    return {
      ...base,
      code: "permission-denied",
      message: `Your current role does not have permission to ${actionLabel}.`,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      ...base,
      code: "not-found",
      message:
        "The resource no longer exists or is not visible in this project.",
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      ...base,
      code: "conflict",
      message:
        "The resource changed before this action completed. Refresh and try again.",
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      ...base,
      code: "rate-limited",
      message: "The service is receiving too many requests. Try again shortly.",
      retryable: true,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      ...base,
      code: "validation-failed",
      message:
        "The service rejected this request. Review the values and try again.",
      retryable: false,
    };
  }

  return {
    ...base,
    code: "service-error",
    message:
      "The cloud service could not complete this action. Try again shortly.",
    retryable: true,
  };
}

export function mutationFailure(
  error: MutationError,
  scope?: MutationScope,
): MutationFailure {
  return { ok: false, status: "error", error, scope };
}

export function mutationSuccess<T>({
  data,
  message,
  scope,
  issues,
  requestId,
}: {
  data: T;
  message: string;
  scope: MutationScope;
  issues?: MutationIssue[];
  requestId?: string;
}): MutationResult<T> {
  return {
    ok: true,
    status: issues?.length ? "partial" : "success",
    data,
    message,
    issues,
    requestId,
    scope,
  };
}
