import "server-only";

import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logging";
import {
  elapsedSeconds,
  observeOpenStackRequest,
  openStackOutcome,
} from "@/lib/metrics";
import { currentSunriseRequestId } from "@/lib/request-correlation.server";
import { getSession } from "@/lib/session";
import { getServiceEndpoint } from "./catalog";
import {
  OpenStackConnectionError,
  OpenStackRequestError,
  serviceUrl,
} from "./request";
import { openstackRequestId } from "./request-id";

const logger = createLogger("openstack.request");

export interface OpenStackRequestOptions {
  regionId: string;
  serviceType: string;
  serviceName: string;
  path: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  unscoped?: boolean;
  errorMode?: "return-null" | "throw";
  endpointOverride?: string;
}

/**
 * Server-only OpenStack request primitive.
 *
 * Callers are responsible for validating any user-controlled path or payload.
 * Browser-callable reads must go through the constrained action in actions.ts.
 */
export async function openstackRequest<T = unknown>({
  regionId,
  serviceType,
  serviceName,
  path,
  apiVersion,
  headers: customHeaders = {},
  method = "GET",
  body,
  unscoped = false,
  errorMode = "return-null",
  endpointOverride,
}: OpenStackRequestOptions): Promise<T | null> {
  const requestId = await currentSunriseRequestId();
  const session = await getSession();
  const token = unscoped
    ? session.keystone_unscoped_token
    : session.keystoneProjectToken;

  if (!token) {
    redirect("/auth/refresh");
  }

  const endpoint =
    endpointOverride ??
    (await getServiceEndpoint(regionId, serviceType, serviceName, token));
  if (!endpoint) return null;

  const headers: Record<string, string> = {
    ...customHeaders,
    "X-Auth-Token": token,
  };
  if (apiVersion) headers["OpenStack-API-Version"] = apiVersion;
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // serviceUrl preserves the trusted endpoint origin even for malformed paths.
  const url = serviceUrl(endpoint, path);
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    observeOpenStackRequest({
      durationSeconds: elapsedSeconds(startedAt),
      method,
      outcome: "network_error",
      serviceType,
    });
    logger.error("unreachable", {
      error,
      method,
      regionId,
      requestId,
      serviceName,
      serviceType,
    });
    if (errorMode === "throw") {
      throw new OpenStackConnectionError(error);
    }
    return null;
  }

  if (!response.ok) {
    observeOpenStackRequest({
      durationSeconds: elapsedSeconds(startedAt),
      method,
      outcome: openStackOutcome(response.status),
      serviceType,
      status: response.status,
    });
    const fields = {
      method,
      regionId,
      requestId,
      serviceName,
      serviceType,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    };
    const expectedMissingResource =
      errorMode === "throw" && response.status === 404;
    if (!expectedMissingResource) {
      if (response.status >= 500) logger.error("rejected", fields);
      else logger.warn("rejected", fields);
    }
    if (response.status === 401) redirect("/auth/refresh");
    if (errorMode === "throw") {
      throw new OpenStackRequestError(response.status, response.statusText);
    }
    return null;
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    observeOpenStackRequest({
      durationSeconds: elapsedSeconds(startedAt),
      method,
      outcome: "body_error",
      serviceType,
      status: response.status,
    });
    logger.error("response-body-failed", {
      error,
      method,
      regionId,
      requestId,
      serviceName,
      serviceType,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return null;
  }

  if (!text.trim()) {
    observeOpenStackRequest({
      durationSeconds: elapsedSeconds(startedAt),
      method,
      outcome: "success",
      serviceType,
      status: response.status,
    });
    return null;
  }

  let payload: T;
  try {
    payload = JSON.parse(text) as T;
  } catch (error) {
    observeOpenStackRequest({
      durationSeconds: elapsedSeconds(startedAt),
      method,
      outcome: "payload_error",
      serviceType,
      status: response.status,
    });
    logger.error("invalid-response", {
      error,
      method,
      regionId,
      requestId,
      serviceName,
      serviceType,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return null;
  }

  observeOpenStackRequest({
    durationSeconds: elapsedSeconds(startedAt),
    method,
    outcome: "success",
    serviceType,
    status: response.status,
  });
  return payload;
}
