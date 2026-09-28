"use server";

import { openstackRequest } from "./request-server";

interface OpenStackActionOptions {
  regionId: string;
  serviceType: string;
  serviceName: string;
  path: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  errorMode?: "return-null" | "throw";
}

const ALLOWED_HEADERS = new Map([
  ["x-openstack-manila-api-version", "X-OpenStack-Manila-API-Version"],
]);

type ReadRoute = {
  serviceType: string;
  serviceName: string;
  pathname: RegExp;
  query?: Record<string, string | true>;
};

const READ_ROUTES: ReadRoute[] = [
  {
    serviceType: "compute",
    serviceName: "nova",
    pathname:
      /^\/(?:os-availability-zone|servers\/detail|servers\/[^/]+(?:\/os-interface|\/os-instance-actions(?:\/[^/]+)?)?|flavors\/detail|flavors\/[^/]+|os-keypairs(?:\/[^/]+)?)$/,
  },
  {
    serviceType: "image",
    serviceName: "glance",
    pathname: /^\/v2\/images(?:\/[^/]+)?$/,
  },
  {
    serviceType: "volumev3",
    serviceName: "cinder",
    pathname:
      /^\/(?:volumes\/detail|volumes\/[^/]+|snapshots\/detail|snapshots\/[^/]+|types|os-availability-zone)$/,
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/networks$/,
    query: { project_id: true, "router:external": "true" },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/subnets$/,
    query: { project_id: true, network_id: true },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/routers$/,
    query: { project_id: true },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/ports$/,
    query: { project_id: true, device_id: true },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/floatingips$/,
    query: { project_id: true },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname: /^\/v2\.0\/security-groups$/,
    query: { project_id: true },
  },
  {
    serviceType: "network",
    serviceName: "neutron",
    pathname:
      /^\/v2\.0\/(?:networks|subnets|routers|ports|floatingips|security-groups)\/[^/]+$/,
  },
  {
    serviceType: "load-balancer",
    serviceName: "octavia",
    pathname: /^\/v2\/lbaas\/availabilityzones$/,
  },
  {
    serviceType: "sharev2",
    serviceName: "manilav2",
    pathname: /^\/[^/]+\/share-networks\/detail$/,
    query: { all_tenants: "0" },
  },
];

function validRequiredString(value: unknown, maxLength = 255): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\r\n]/.test(value)
  );
}

function hasSafePathSegments(path: string) {
  const pathname = path.split("?", 1)[0];
  if (path.includes("#") || pathname.includes("\\")) return false;

  return pathname.split("/").every((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !/[\\/]/.test(decoded);
    } catch {
      return false;
    }
  });
}

function matchesReadRoute(
  serviceType: string,
  serviceName: string,
  path: string,
) {
  if (!hasSafePathSegments(path)) return false;

  const url = new URL(path, "http://openstack.invalid");
  return READ_ROUTES.some((route) => {
    if (
      route.serviceType !== serviceType ||
      route.serviceName !== serviceName ||
      !route.pathname.test(url.pathname)
    ) {
      return false;
    }

    for (const [name, value] of url.searchParams) {
      const allowedValue = route.query?.[name];
      if (
        allowedValue === undefined ||
        (allowedValue !== true && allowedValue !== value)
      ) {
        return false;
      }
    }
    return true;
  });
}

function validateOptions(options: OpenStackActionOptions) {
  if (!options || typeof options !== "object") {
    throw new Error("Invalid OpenStack request");
  }

  const { regionId, serviceType, serviceName, path, apiVersion, errorMode } =
    options;
  if (
    !validRequiredString(regionId) ||
    !validRequiredString(serviceType) ||
    !validRequiredString(serviceName) ||
    !validRequiredString(path, 8_192) ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    !matchesReadRoute(serviceType, serviceName, path)
  ) {
    throw new Error("Invalid OpenStack request");
  }
  if (apiVersion !== undefined && !validRequiredString(apiVersion)) {
    throw new Error("Invalid OpenStack API version");
  }
  if (
    errorMode !== undefined &&
    errorMode !== "return-null" &&
    errorMode !== "throw"
  ) {
    throw new Error("Invalid OpenStack error mode");
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    const canonicalName = ALLOWED_HEADERS.get(name.toLowerCase());
    if (!canonicalName || !validRequiredString(value)) {
      throw new Error("Invalid OpenStack request header");
    }
    headers[canonicalName] = value;
  }

  return {
    regionId,
    serviceType,
    serviceName,
    path,
    apiVersion,
    headers,
    errorMode,
  };
}

/**
 * Browser-callable, read-only OpenStack gateway.
 *
 * The destination is always resolved from Keystone's service catalog. Request
 * methods, bodies, unscoped credentials, and endpoint overrides are kept out of
 * this public Server Action and are available only to server-only modules.
 */
export async function openstack<T = unknown>(
  options: OpenStackActionOptions,
): Promise<T | null> {
  return openstackRequest<T>(validateOptions(options));
}
