import "server-only";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getServiceEndpoint } from "./catalog";
import {
  OpenStackConnectionError,
  OpenStackRequestError,
  serviceUrl,
} from "./request";

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
  const session = await getSession();
  const token = unscoped
    ? session.keystone_unscoped_token
    : session.keystoneProjectToken;

  if (!token) {
    console.error(`No ${unscoped ? "unscoped" : "project"} token in session`);
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
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    if (errorMode === "throw") {
      throw new OpenStackConnectionError(error);
    }
    console.error("OpenStack fetch error:", error);
    return null;
  }

  if (!response.ok) {
    if (response.status === 401) redirect("/auth/refresh");
    if (errorMode === "throw") {
      throw new OpenStackRequestError(response.status, response.statusText);
    }
    console.error(
      `OpenStack API error: ${response.status} ${response.statusText} for ${url}`,
    );
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    // Some APIs return empty responses.
    return null;
  }
}
