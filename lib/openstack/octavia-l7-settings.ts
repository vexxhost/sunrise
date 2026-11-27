import { z } from "zod";

import type {
  OctaviaL7Policy,
  OctaviaL7Rule,
  OctaviaListener,
  OctaviaPool,
} from "@/types/openstack";

export const L7_PATH_COMPARISONS = ["STARTS_WITH", "EQUAL_TO"] as const;
export const L7_PATH_MAX_LENGTH = 255;
export const L7_POOL_ACTION = "REDIRECT_TO_POOL";

export const l7PathSchema = z
  .object({
    compare_type: z.enum(L7_PATH_COMPARISONS),
    value: z
      .string()
      .max(L7_PATH_MAX_LENGTH)
      .refine(
        (value) =>
          /^\/(?!\/)(?:[-A-Za-z0-9._~!&()*+,;=:@/]|%[0-9a-f]{2})*$/i.test(
            value,
          ) && !/\s/.test(value),
        "Enter a path starting with /, without a host, query string, or fragment.",
      ),
  })
  .strict();

export type L7Path = z.infer<typeof l7PathSchema>;

export const l7PoolPolicySchema = z
  .object({
    name: z.string().max(255),
    description: z.string().max(255),
    redirect_pool_id: z.uuid().toLowerCase(),
  })
  .strict();

export type L7PoolPolicySettings = z.infer<typeof l7PoolPolicySchema>;

export type L7RoutingPool = Pick<
  OctaviaPool,
  "id" | "name" | "protocol" | "provisioning_status"
>;

export function isL7HttpListener(listener: Pick<OctaviaListener, "protocol">) {
  return listener.protocol === "HTTP";
}

export function isL7HttpPool(
  pool: Pick<OctaviaPool, "protocol" | "provisioning_status">,
) {
  return pool.protocol === "HTTP" && pool.provisioning_status === "ACTIVE";
}

export function l7PolicyRuleIds(policy: Pick<OctaviaL7Policy, "rules">) {
  const parsed = z.array(z.object({ id: z.uuid() })).safeParse(policy.rules);
  return parsed.success ? parsed.data.map(({ id }) => id) : null;
}

export function readL7PoolPolicy(policy: OctaviaL7Policy) {
  if (policy.action !== L7_POOL_ACTION) return null;
  const parsed = l7PoolPolicySchema.safeParse({
    name: policy.name ?? "",
    description: policy.description ?? "",
    redirect_pool_id: policy.redirect_pool_id,
  });
  return parsed.success ? parsed.data : null;
}

export function readL7Path(rule: OctaviaL7Rule) {
  if (
    rule.type !== "PATH" ||
    rule.invert !== false ||
    rule.admin_state_up !== true ||
    rule.key != null
  )
    return null;
  const parsed = l7PathSchema.safeParse({
    compare_type: rule.compare_type,
    value: rule.value,
  });
  return parsed.success ? parsed.data : null;
}

export function sameL7Path(a: L7Path, b: L7Path) {
  return a.compare_type === b.compare_type && a.value === b.value;
}

export function sameL7PoolPolicy(
  a: L7PoolPolicySettings,
  b: L7PoolPolicySettings,
) {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.redirect_pool_id === b.redirect_pool_id
  );
}
