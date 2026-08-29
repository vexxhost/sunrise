import "server-only";

import { revalidatePath } from "next/cache";
import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  mutationSuccess,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
} from "@/lib/openstack/catalog";
import { serviceUrl } from "@/lib/openstack/request";

type OpenStackMutationOptions<T> = {
  actionLabel: string;
  apiVersion?: string;
  body?: unknown;
  headers?: Record<string, string>;
  invalidates?: string[];
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  scope: MutationScope;
  serviceName: string;
  serviceType: string;
  successMessage: string;
  transform?: (payload: unknown) => T;
};

function responseRequestId(response: Response) {
  return (
    response.headers.get("x-openstack-request-id") ??
    response.headers.get("x-compute-request-id") ??
    response.headers.get("x-trans-id") ??
    undefined
  );
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function executeOpenStackMutation<T = null>({
  actionLabel,
  apiVersion,
  body,
  headers: customHeaders,
  invalidates = [],
  method,
  path,
  scope,
  serviceName,
  serviceType,
  successMessage,
  transform,
}: OpenStackMutationOptions<T>): Promise<MutationResult<T>> {
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;

  const { projectToken, scope: activeScope } = guarded.context;
  const catalog = await getServiceCatalog(projectToken!);
  if (!catalog) {
    return mutationFailure(
      {
        code: "service-error",
        message:
          "Cloud service discovery is temporarily unavailable. Try again shortly.",
        retryable: true,
      },
      activeScope,
    );
  }

  const endpoint = resolveServiceEndpoint(
    catalog,
    activeScope.regionId!,
    serviceType,
    serviceName,
  );

  if (!endpoint) {
    return mutationFailure(
      {
        code: "service-unavailable",
        message: `${serviceName} is not available in ${activeScope.regionId}.`,
        retryable: false,
      },
      activeScope,
    );
  }

  const url = serviceUrl(endpoint, path);
  const headers: Record<string, string> = {
    "X-Auth-Token": projectToken!,
    ...customHeaders,
  };
  if (apiVersion) headers["OpenStack-API-Version"] = apiVersion;
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[mutation] OpenStack service unreachable", {
      actionLabel,
      error,
      projectId: activeScope.projectId,
      regionId: activeScope.regionId,
      serviceName,
    });
    return mutationFailure(
      {
        code: "network-error",
        message: `${serviceName} could not be reached. Try again shortly.`,
        retryable: true,
      },
      activeScope,
    );
  }

  const requestId = responseRequestId(response);
  const payload = await responsePayload(response);

  if (!response.ok) {
    console.error("[mutation] OpenStack action rejected", {
      actionLabel,
      method,
      path,
      projectId: activeScope.projectId,
      regionId: activeScope.regionId,
      requestId,
      serviceName,
      status: response.status,
    });
    return mutationFailure(
      mutationErrorForStatus(response.status, actionLabel, requestId),
      activeScope,
    );
  }

  let data: T;
  try {
    data = transform ? transform(payload) : (payload as T);
  } catch (error) {
    console.error("[mutation] invalid OpenStack response", {
      actionLabel,
      error,
      projectId: activeScope.projectId,
      regionId: activeScope.regionId,
      requestId,
      serviceName,
    });
    return mutationFailure(
      {
        code: "invalid-response",
        message:
          "The action completed, but the service returned an unexpected response. Refresh before continuing.",
        requestId,
        retryable: true,
      },
      activeScope,
    );
  }

  for (const invalidatedPath of new Set(invalidates)) {
    revalidatePath(invalidatedPath);
  }

  return mutationSuccess({
    data,
    message: successMessage,
    requestId,
    scope: activeScope,
  });
}
