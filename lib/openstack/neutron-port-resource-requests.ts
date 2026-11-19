export interface NeutronPortResourceRequestGroup {
  id?: string;
  required: string[];
  resources: Array<{ amount: number; resourceClass: string }>;
}

export interface NeutronPortResourceRequest {
  groups: NeutronPortResourceRequestGroup[];
  sameSubtree: string[];
}

export interface NeutronPortResourceRequestInspection {
  reported: boolean;
  request: NeutronPortResourceRequest | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function resourceList(value: unknown) {
  const resources = record(value);
  if (!resources) return [];

  return Object.entries(resources).flatMap(([resourceClass, amount]) =>
    typeof amount === "number" && Number.isFinite(amount)
      ? [{ amount, resourceClass }]
      : [],
  );
}

function requestGroup(value: unknown): NeutronPortResourceRequestGroup | null {
  const group = record(value);
  if (!group) return null;

  const resources = resourceList(group.resources);
  const required = stringList(group.required);
  if (resources.length === 0 && required.length === 0) return null;

  return {
    ...(typeof group.id === "string" ? { id: group.id } : {}),
    required,
    resources,
  };
}

export function normalizeNeutronPortResourceRequest(
  value: unknown,
): NeutronPortResourceRequest | null {
  const request = record(value);
  if (!request) return null;

  const grouped = Array.isArray(request.request_groups)
    ? request.request_groups.flatMap((group) => {
        const parsed = requestGroup(group);
        return parsed ? [parsed] : [];
      })
    : [];
  const legacy = requestGroup(request);
  const groups = grouped.length > 0 ? grouped : legacy ? [legacy] : [];
  if (groups.length === 0) return null;

  return {
    groups,
    sameSubtree: stringList(request.same_subtree),
  };
}

export function inspectNeutronPortResourceRequest(
  port: object,
): NeutronPortResourceRequestInspection {
  const reported = Object.prototype.hasOwnProperty.call(
    port,
    "resource_request",
  );

  return {
    reported,
    request: reported
      ? normalizeNeutronPortResourceRequest(
          (port as { resource_request?: unknown }).resource_request,
        )
      : null,
  };
}

export function neutronPortIpAllocationLabel(value: string | undefined) {
  if (!value) return "Not reported";
  if (value === "immediate") return "Immediate";
  if (value === "deferred") return "Deferred until the port is bound";
  if (value === "none") return "No IP allocation";
  return value;
}
