"use server";

import { z } from "zod";

import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationFailure,
  normalizeMutationProjectId,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_L3_CONNTRACK_HELPER_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import { NEUTRON_CONNTRACK_HELPER_PROTOCOLS } from "@/lib/openstack/neutron-router-conntrack-helpers";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";
import type { RouterConntrackHelper } from "@/types/openstack";

const SERVICE_TYPE = "network";
const SERVICE_NAME = "neutron";
const resourceId = z.string().trim().min(1).max(255);
const helperName = z
  .string()
  .trim()
  .min(1, "Enter a conntrack helper name.")
  .max(64, "Helper names can contain at most 64 characters.")
  .refine((value) => !/[\r\n]/.test(value), "Enter one helper name.");
const conntrackHelperInputSchema = z.object({
  helper: helperName,
  port: z
    .number()
    .int("Enter a whole port number.")
    .min(1, "Ports start at 1.")
    .max(65_535, "Ports end at 65535."),
  protocol: z.enum(NEUTRON_CONNTRACK_HELPER_PROTOCOLS),
});

export type RouterConntrackHelperInput = z.input<
  typeof conntrackHelperInputSchema
>;

type RouterOwner = {
  id: string;
  project_id?: string;
  tenant_id?: string;
};

function validResourceId(value: string) {
  return Boolean(value) && value.length <= 255 && !/[\r\n]/.test(value);
}

function projectOwnsResource(resource: RouterOwner, projectId: string) {
  const owner = resource.project_id || resource.tenant_id;
  return (
    Boolean(owner) &&
    normalizeMutationProjectId(owner) === normalizeMutationProjectId(projectId)
  );
}

function validationFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function permissionFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "permission-denied", message, retryable: false },
    scope,
  );
}

function serviceFailure(message: string, scope: MutationScope) {
  return mutationFailure(
    { code: "service-error", message, retryable: true },
    scope,
  );
}

function parseRouter(payload: unknown): RouterOwner | null {
  if (!payload || typeof payload !== "object") return null;
  const router = Reflect.get(payload, "router");
  if (
    !router ||
    typeof router !== "object" ||
    typeof Reflect.get(router, "id") !== "string"
  ) {
    return null;
  }
  return router as RouterOwner;
}

function parseConntrackHelper(value: unknown): RouterConntrackHelper {
  const id =
    value && typeof value === "object" ? Reflect.get(value, "id") : null;
  const helper =
    value && typeof value === "object" ? Reflect.get(value, "helper") : null;
  const port =
    value && typeof value === "object" ? Reflect.get(value, "port") : null;
  const protocol =
    value && typeof value === "object" ? Reflect.get(value, "protocol") : null;
  if (
    !value ||
    typeof value !== "object" ||
    typeof id !== "string" ||
    !validResourceId(id) ||
    typeof helper !== "string" ||
    helper.length < 1 ||
    helper.length > 64 ||
    /[\r\n]/.test(helper) ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    typeof protocol !== "string" ||
    !NEUTRON_CONNTRACK_HELPER_PROTOCOLS.includes(
      protocol as (typeof NEUTRON_CONNTRACK_HELPER_PROTOCOLS)[number],
    )
  ) {
    throw new Error("Invalid Neutron router conntrack helper response");
  }
  return value as RouterConntrackHelper;
}

function parseConntrackHelperResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron router conntrack helper response");
  }
  return parseConntrackHelper(Reflect.get(payload, "conntrack_helper"));
}

function parseConntrackHelperCollection(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron router conntrack helper response");
  }
  const values = Reflect.get(payload, "conntrack_helpers");
  if (!Array.isArray(values)) {
    throw new Error("Invalid Neutron router conntrack helper response");
  }
  return values.map(parseConntrackHelper);
}

async function requestRouter(regionId: string, routerId: string) {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/routers/${encodeURIComponent(routerId)}`,
  });
  const router = parseRouter(payload);
  return router?.id === routerId ? router : null;
}

async function requestConntrackHelper(
  regionId: string,
  routerId: string,
  helperId: string,
) {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/routers/${encodeURIComponent(routerId)}/conntrack_helpers/${encodeURIComponent(helperId)}`,
  });
  const helper = payload ? parseConntrackHelperResponse(payload) : null;
  return helper?.id === helperId ? helper : null;
}

async function validateParent(
  regionId: string,
  projectId: string,
  routerId: string,
  scope: MutationScope,
) {
  const router = await requestRouter(regionId, routerId);
  if (!router) {
    return {
      ok: false as const,
      result: serviceFailure(
        "Sunrise could not verify the router before changing its conntrack helpers.",
        scope,
      ),
    };
  }
  if (!projectOwnsResource(router, projectId)) {
    return {
      ok: false as const,
      result: permissionFailure(
        "Conntrack helpers can only be changed on routers owned by the active project.",
        scope,
      ),
    };
  }
  return { ok: true as const, value: router };
}

async function resolveReadScope(regionId: string, projectId: string) {
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Neutron request");
  }
  if (session.regionId.toLowerCase() !== regionId.toLowerCase()) {
    throw new Error("Neutron region does not match the active session");
  }
  if (
    normalizeMutationProjectId(session.projectId) !==
    normalizeMutationProjectId(projectId)
  ) {
    throw new Error("Neutron project does not match the active session");
  }
  return { projectId: session.projectId, regionId: session.regionId };
}

export async function listProjectRouterConntrackHelpers(
  regionId: string,
  projectId: string,
  routerId: string,
) {
  if (!validResourceId(routerId)) {
    throw new Error("Invalid Neutron router ID");
  }
  const scope = await resolveReadScope(regionId, projectId);
  const router = await requestRouter(scope.regionId, routerId);
  if (!router || !projectOwnsResource(router, scope.projectId)) {
    throw new Error("Router was not found in the active project");
  }
  const payload = await openstackRequest<unknown>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: `/v2.0/routers/${encodeURIComponent(routerId)}/conntrack_helpers`,
    errorMode: "throw",
  });
  return parseConntrackHelperCollection(payload);
}

async function prepareMutation(
  expectedScope: MutationScope,
  routerId: string,
  input: RouterConntrackHelperInput,
  conntrackHelperId?: string,
) {
  const guarded = await guardMutationContext(expectedScope);
  if (!guarded.ok) return guarded;
  const scope = guarded.context.scope;
  const parsedRouterId = resourceId.safeParse(routerId);
  const parsedHelperId =
    conntrackHelperId === undefined
      ? null
      : resourceId.safeParse(conntrackHelperId);
  const parsedInput = conntrackHelperInputSchema.safeParse(input);
  if (
    !parsedRouterId.success ||
    (parsedHelperId !== null && !parsedHelperId.success) ||
    !parsedInput.success
  ) {
    return {
      ok: false as const,
      result: validationFailure(
        parsedHelperId !== null && !parsedHelperId.success
          ? "Select a valid conntrack helper."
          : (parsedInput.error?.issues[0]?.message ??
              "Review the conntrack helper values and try again."),
        scope,
      ),
    };
  }

  const capabilities = await discoverNetworkCapabilities(scope.regionId!);
  const support = extensionSupport(
    capabilities,
    NEUTRON_L3_CONNTRACK_HELPER_EXTENSION,
    "Router conntrack helpers",
  );
  if (support.status === "unsupported") {
    return {
      ok: false as const,
      result: mutationFailure(
        {
          code: "service-unavailable",
          message: support.message,
          retryable: false,
        },
        scope,
      ),
    };
  }

  const parent = await validateParent(
    scope.regionId!,
    scope.projectId,
    parsedRouterId.data,
    scope,
  );
  if (!parent.ok) return { ok: false as const, result: parent.result };

  if (parsedHelperId) {
    const existing = await requestConntrackHelper(
      scope.regionId!,
      parsedRouterId.data,
      parsedHelperId.data,
    );
    if (!existing) {
      return {
        ok: false as const,
        result: serviceFailure(
          "Sunrise could not verify the conntrack helper before changing it.",
          scope,
        ),
      };
    }
  }

  return {
    ok: true as const,
    body: {
      conntrack_helper: {
        helper: parsedInput.data.helper,
        port: parsedInput.data.port,
        protocol: parsedInput.data.protocol,
      },
    },
    conntrackHelperId: parsedHelperId?.data,
    routerId: parsedRouterId.data,
    scope,
  };
}

export async function createRouterConntrackHelperAction(
  scope: MutationScope,
  routerId: string,
  input: RouterConntrackHelperInput,
): Promise<MutationResult<RouterConntrackHelper>> {
  const prepared = await prepareMutation(scope, routerId, input);
  if (!prepared.ok) return prepared.result;
  return executeOpenStackMutation<RouterConntrackHelper>({
    actionLabel: "create the router conntrack helper",
    body: prepared.body,
    invalidates: [
      "/networking/routers",
      `/networking/routers/${prepared.routerId}`,
    ],
    method: "POST",
    path: `/v2.0/routers/${encodeURIComponent(prepared.routerId)}/conntrack_helpers`,
    scope: prepared.scope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Conntrack helper created.",
    transform: parseConntrackHelperResponse,
  });
}

export async function updateRouterConntrackHelperAction(
  scope: MutationScope,
  routerId: string,
  conntrackHelperId: string,
  input: RouterConntrackHelperInput,
): Promise<MutationResult<RouterConntrackHelper>> {
  const prepared = await prepareMutation(
    scope,
    routerId,
    input,
    conntrackHelperId,
  );
  if (!prepared.ok) return prepared.result;
  return executeOpenStackMutation<RouterConntrackHelper>({
    actionLabel: "update the router conntrack helper",
    body: prepared.body,
    invalidates: [
      "/networking/routers",
      `/networking/routers/${prepared.routerId}`,
    ],
    method: "PUT",
    path: `/v2.0/routers/${encodeURIComponent(prepared.routerId)}/conntrack_helpers/${encodeURIComponent(prepared.conntrackHelperId!)}`,
    scope: prepared.scope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Conntrack helper updated.",
    transform: parseConntrackHelperResponse,
  });
}

export async function deleteRouterConntrackHelperAction(
  scope: MutationScope,
  routerId: string,
  conntrackHelperId: string,
): Promise<MutationResult<null>> {
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const parsedRouterId = resourceId.safeParse(routerId);
  const parsedHelperId = resourceId.safeParse(conntrackHelperId);
  if (!parsedRouterId.success || !parsedHelperId.success) {
    return validationFailure("Select a valid conntrack helper.", activeScope);
  }

  const capabilities = await discoverNetworkCapabilities(activeScope.regionId!);
  const support = extensionSupport(
    capabilities,
    NEUTRON_L3_CONNTRACK_HELPER_EXTENSION,
    "Router conntrack helpers",
  );
  if (support.status === "unsupported") {
    return mutationFailure(
      {
        code: "service-unavailable",
        message: support.message,
        retryable: false,
      },
      activeScope,
    );
  }

  const parent = await validateParent(
    activeScope.regionId!,
    activeScope.projectId,
    parsedRouterId.data,
    activeScope,
  );
  if (!parent.ok) return parent.result;
  const existing = await requestConntrackHelper(
    activeScope.regionId!,
    parsedRouterId.data,
    parsedHelperId.data,
  );
  if (!existing) {
    return serviceFailure(
      "Sunrise could not verify the conntrack helper before deleting it.",
      activeScope,
    );
  }

  return executeOpenStackMutation<null>({
    actionLabel: "delete the router conntrack helper",
    invalidates: [
      "/networking/routers",
      `/networking/routers/${parsedRouterId.data}`,
    ],
    method: "DELETE",
    path: `/v2.0/routers/${encodeURIComponent(parsedRouterId.data)}/conntrack_helpers/${encodeURIComponent(parsedHelperId.data)}`,
    scope: activeScope,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    successMessage: "Conntrack helper deleted.",
  });
}
