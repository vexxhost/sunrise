"use server";

import { z } from "zod";

import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  normalizeMutationProjectId,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { OCTAVIA_BASELINE_MICROVERSION } from "@/lib/openstack/capabilities-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  canChangeOctaviaListener,
  canChangeOctaviaListeners,
  isOctaviaAmphoraProvider,
} from "@/lib/openstack/octavia";
import {
  isL7HttpListener,
  isL7HttpPool,
  L7_POOL_ACTION,
  l7PathSchema,
  l7PolicyRuleIds,
  l7PoolPolicySchema,
  readL7Path,
  readL7PoolPolicy,
  sameL7Path,
  sameL7PoolPolicy,
} from "@/lib/openstack/octavia-l7-settings";
import {
  getLoadBalancer,
  getLoadBalancerListener,
  getLoadBalancerPool,
  getOctaviaL7Rule,
  getOctaviaListenerL7Policy,
} from "@/lib/openstack/octavia-server";
import { OpenStackRequestError } from "@/lib/openstack/request";

const idSchema = z.uuid().toLowerCase();
const pathSnapshot = z.object({ id: idSchema, settings: l7PathSchema });
const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-policy"),
    settings: l7PoolPolicySchema,
  }),
  z.object({
    action: z.literal("edit-policy"),
    policyId: idSchema,
    settings: l7PoolPolicySchema,
    source: l7PoolPolicySchema,
  }),
  z
    .object({
      action: z.literal("set-enabled"),
      policyId: idSchema,
      enabled: z.boolean(),
      poolId: idSchema,
      sourceRule: pathSnapshot.nullable(),
    })
    .refine(({ enabled, sourceRule }) => !enabled || sourceRule !== null),
  z.object({ action: z.literal("delete-policy"), policyId: idSchema }),
  z.object({
    action: z.literal("delete-failed-policy"),
    policyId: idSchema,
    poolId: idSchema,
    sourceRule: pathSnapshot.nullable(),
  }),
  z.object({
    action: z.literal("add-rule"),
    policyId: idSchema,
    settings: l7PathSchema,
  }),
  z.object({
    action: z.literal("edit-rule"),
    policyId: idSchema,
    sourceRule: pathSnapshot,
    settings: l7PathSchema,
  }),
  z.object({
    action: z.literal("delete-rule"),
    policyId: idSchema,
    sourceRule: pathSnapshot,
  }),
]);

export type OctaviaL7Mutation = z.input<typeof mutationSchema>;

function conflict(
  scope: MutationScope,
  message = "A routing resource changed or is still being provisioned. Refresh and try again.",
) {
  return mutationFailure({ code: "conflict", message, retryable: true }, scope);
}

function unavailable(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

const operations = {
  "create-policy": [
    "POST",
    "create a routing policy",
    "Routing policy creation requested.",
  ],
  "edit-policy": [
    "PUT",
    "edit this routing policy",
    "Routing policy update requested.",
  ],
  "set-enabled": [
    "PUT",
    "change this routing policy state",
    "Routing policy state update requested.",
  ],
  "delete-policy": [
    "DELETE",
    "delete this routing policy",
    "Routing policy deletion requested.",
  ],
  "delete-failed-policy": [
    "DELETE",
    "delete this failed routing policy",
    "Failed routing policy deletion requested.",
  ],
  "add-rule": ["POST", "add a path rule", "Path rule creation requested."],
  "edit-rule": ["PUT", "edit this path rule", "Path rule update requested."],
  "delete-rule": [
    "DELETE",
    "delete this path rule",
    "Path rule deletion requested.",
  ],
} as const;

export async function mutateOctaviaL7Action(
  scope: MutationScope,
  loadBalancerId: string,
  listenerId: string,
  input: OctaviaL7Mutation,
): Promise<MutationResult<null>> {
  const parent = idSchema.safeParse(loadBalancerId);
  const listenerRef = idSchema.safeParse(listenerId);
  const parsed = mutationSchema.safeParse(input);
  if (!parent.success || !listenerRef.success || !parsed.success) {
    return unavailable(scope, "Review the routing settings and try again.");
  }
  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const active = guarded.context.scope;
  const parentId = parent.data;
  const targetListener = listenerRef.data;
  const { regionId, projectId } = active;
  const value = parsed.data;
  let path = "/v2/lbaas/l7policies";
  const policyId = "policyId" in value ? value.policyId : undefined;
  if (policyId) path += `/${policyId}`;
  let ruleId: string | undefined;
  let body: Record<string, unknown> | undefined;
  let poolId: string | undefined;
  try {
    const lb = await getLoadBalancer(parentId, regionId, projectId);
    if (
      lb.id !== parentId ||
      !lb.listeners?.some((ref) => ref?.id === targetListener)
    ) {
      return mutationFailure(
        mutationErrorForStatus(404, "read this listener"),
        active,
      );
    }
    if (!isOctaviaAmphoraProvider(lb.provider)) {
      return unavailable(
        active,
        "Path routing is not available for this load balancer provider.",
      );
    }
    if (!canChangeOctaviaListeners(lb)) return conflict(active);
    const listener = await getLoadBalancerListener(
      parentId,
      targetListener,
      regionId,
      projectId,
    );
    if (!isL7HttpListener(listener)) {
      return unavailable(
        active,
        "Path routing is only available on HTTP listeners.",
      );
    }
    if (!canChangeOctaviaListeners(listener)) return conflict(active);

    if (value.action === "create-policy") {
      poolId = value.settings.redirect_pool_id;
      body = {
        l7policy: {
          ...value.settings,
          action: L7_POOL_ACTION,
          admin_state_up: false,
          listener_id: targetListener,
        },
      };
    } else {
      if (!listener.l7policies?.some((ref) => ref?.id === value.policyId)) {
        return mutationFailure(
          mutationErrorForStatus(404, "read this routing policy"),
          active,
        );
      }
      const policy = await getOctaviaListenerL7Policy(
        targetListener,
        value.policyId,
        regionId,
        projectId,
      );
      const current = readL7PoolPolicy(policy);
      const rules = l7PolicyRuleIds(policy);
      if (
        !current ||
        !rules ||
        rules.length > 1 ||
        typeof policy.admin_state_up !== "boolean"
      ) {
        return unavailable(
          active,
          "Only pool routing policies with one basic path rule or no rules can be changed here.",
        );
      }
      const deletingFailedPolicy = value.action === "delete-failed-policy";
      // Octavia rejects nested rule deletion while the parent policy is in ERROR.
      if (deletingFailedPolicy) {
        if (
          policy.provisioning_status !== "ERROR" ||
          current.redirect_pool_id !== value.poolId
        ) {
          return conflict(
            active,
            "The failed policy changed. Refresh and try again.",
          );
        }
      } else if (policy.provisioning_status !== "ACTIVE") {
        return conflict(active);
      }
      if (
        value.action !== "set-enabled" &&
        !deletingFailedPolicy &&
        policy.admin_state_up
      ) {
        return conflict(
          active,
          "Disable the routing policy before changing or deleting it.",
        );
      }
      if (value.action === "delete-policy" && rules.length) {
        return conflict(
          active,
          "Remove the path rule before deleting its policy.",
        );
      }
      if (value.action === "add-rule" && rules.length) {
        return conflict(active, "This policy already has a path rule.");
      }
      if (
        "sourceRule" in value &&
        (rules[0] ?? null) !== (value.sourceRule?.id ?? null)
      ) {
        return conflict(
          active,
          "The path rule changed. Refresh and try again.",
        );
      }
      let currentPath;
      if (rules.length) {
        const rule = await getOctaviaL7Rule(
          policy.id,
          rules[0],
          regionId,
          projectId,
        );
        const allowRuleError =
          deletingFailedPolicy ||
          value.action === "delete-rule" ||
          (value.action === "set-enabled" && !value.enabled);
        if (
          !(allowRuleError
            ? canChangeOctaviaListener(rule)
            : canChangeOctaviaListeners(rule))
        )
          return conflict(active);
        currentPath = readL7Path(rule);
        if (!currentPath)
          return unavailable(
            active,
            "This rule is not a supported path comparison.",
          );
      }
      if (
        "sourceRule" in value &&
        value.sourceRule &&
        (!currentPath || !sameL7Path(currentPath, value.sourceRule.settings))
      )
        return conflict(
          active,
          "The path rule changed. Refresh and try again.",
        );
      switch (value.action) {
        case "edit-policy":
          if (!sameL7PoolPolicy(current, value.source)) return conflict(active);
          poolId = value.settings.redirect_pool_id;
          body = { l7policy: value.settings };
          break;
        case "set-enabled":
          if (
            policy.admin_state_up === value.enabled ||
            current.redirect_pool_id !== value.poolId
          )
            return conflict(active);
          if (value.enabled) poolId = current.redirect_pool_id;
          body = { l7policy: { admin_state_up: value.enabled } };
          break;
        case "add-rule":
          path += "/rules";
          body = {
            rule: {
              ...value.settings,
              type: "PATH",
              invert: false,
              admin_state_up: true,
            },
          };
          break;
        case "edit-rule":
          ruleId = value.sourceRule.id;
          path += `/rules/${ruleId}`;
          body = { rule: value.settings };
          break;
        case "delete-rule":
          ruleId = value.sourceRule.id;
          path += `/rules/${ruleId}`;
          break;
      }
    }
    if (poolId) {
      const pool = await getLoadBalancerPool(
        parentId,
        poolId,
        regionId,
        projectId,
      );
      if (!isL7HttpPool(pool))
        return conflict(
          active,
          "Select an Active HTTP pool on this load balancer.",
        );
    }
  } catch (error) {
    if (error instanceof OpenStackRequestError) {
      return mutationFailure(
        mutationErrorForStatus(error.status, "read routing resources"),
        active,
      );
    }
    return mutationFailure(
      {
        code: "service-error",
        message:
          "Octavia routing settings could not be verified. Try again shortly.",
        retryable: true,
      },
      active,
    );
  }

  const [method, actionLabel, successMessage] = operations[value.action];
  const isRule = value.action === "add-rule" || value.action === "edit-rule";
  const responseKey = isRule ? "rule" : "l7policy";
  return executeOpenStackMutation<null>({
    serviceType: "load-balancer",
    serviceName: "octavia",
    scope: active,
    path,
    method,
    actionLabel,
    successMessage,
    apiVersion: `load-balancer ${OCTAVIA_BASELINE_MICROVERSION}`,
    ...(body ? { body } : {}),
    invalidates: [`/networking/load-balancers/${parentId}`, "/quotas"],
    transform: (payload) => {
      if (method === "DELETE") return null;
      const response = z
        .object({
          [responseKey]: z.object({
            id: idSchema,
            project_id: z.string(),
            listener_id: idSchema.optional(),
            l7policy_id: idSchema.optional(),
          }),
        })
        .safeParse(payload);
      const resource = response.success
        ? response.data[responseKey]
        : undefined;
      const expectedId = isRule ? ruleId : policyId;
      if (
        !resource ||
        (expectedId && resource.id !== expectedId) ||
        normalizeMutationProjectId(resource.project_id) !==
          normalizeMutationProjectId(projectId) ||
        (isRule
          ? resource.l7policy_id !== undefined &&
            resource.l7policy_id !== policyId
          : resource.listener_id !== targetListener)
      )
        throw new Error("Octavia returned an invalid routing resource");
      return null;
    },
  });
}
