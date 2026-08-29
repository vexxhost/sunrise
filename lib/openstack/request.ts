import "server-only";

export class OpenStackRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`OpenStack request failed: ${status} ${statusText}`);
  }
}

export class OpenStackConnectionError extends Error {
  constructor(readonly originalError: unknown) {
    super("OpenStack service is unreachable");
  }
}

export class OpenStackPayloadError extends Error {}

export function serviceUrl(endpoint: string, path: string) {
  const url = new URL(endpoint);
  const requested = new URL(path, "http://openstack.invalid");
  url.pathname = `${url.pathname.replace(/\/$/, "")}${requested.pathname}`;
  url.search = requested.search;
  return url.toString();
}

export async function requestJson(
  url: string,
  headers: Record<string, string>,
) {
  let response: Response;
  try {
    response = await fetch(url, { headers, cache: "no-store" });
  } catch (error) {
    throw new OpenStackConnectionError(error);
  }

  if (!response.ok) {
    throw new OpenStackRequestError(response.status, response.statusText);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new OpenStackPayloadError(
      error instanceof Error ? error.message : "Invalid JSON response",
    );
  }
}

export function asRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpenStackPayloadError(`Invalid ${name} response`);
  }
  return value as Record<string, unknown>;
}
