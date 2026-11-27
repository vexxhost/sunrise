import { z } from "zod";

import type {
  OctaviaL7Policy,
  OctaviaL7Rule,
  OctaviaListener,
  OctaviaPool,
} from "@/types/openstack";

export const L7_PATH_COMPARISONS = ["STARTS_WITH", "EQUAL_TO"] as const;
export const L7_PATH_MAX_LENGTH = 255;
export const L7_HOST_VALUE_MAX_LENGTH = 255;
export const L7_POOL_ACTION = "REDIRECT_TO_POOL";

const l7PathRuleSchema = z
  .object({
    type: z.literal("PATH"),
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

const l7HostnameRuleSchema = z.strictObject({
  type: z.literal("HOST_NAME"),
  compare_type: z.literal("EQUAL_TO"),
  value: z
    .string()
    .max(L7_HOST_VALUE_MAX_LENGTH)
    .refine((value) => {
      if (/[^a-z0-9.:-]/i.test(value)) return false;
      // Amphora compares the full Host header, including an explicit port.
      const [host, port, extra] = value.split(":");
      return (
        extra === undefined &&
        (port === undefined ||
          (/^[0-9]{1,5}$/.test(port) &&
            Number(port) >= 1 &&
            Number(port) <= 65535)) &&
        host.length <= 253 &&
        host
          .split(".")
          .every((label) =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
          )
      );
    }, "Enter a hostname with an optional port, without a scheme, path, or wildcard."),
});

export const l7RuleSettingsSchema = z.discriminatedUnion("type", [
  l7PathRuleSchema,
  l7HostnameRuleSchema,
]);

export type L7RuleSettings = z.infer<typeof l7RuleSettingsSchema>;

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

export function readL7PolicyOrder(
  listener: Pick<OctaviaListener, "l7policies">,
  policies: readonly Pick<OctaviaL7Policy, "id" | "position">[],
) {
  const references = z
    .array(z.object({ id: z.uuid() }))
    .safeParse(listener.l7policies);
  if (!references.success || references.data.length !== policies.length)
    return null;

  const remaining = new Set(references.data.map(({ id }) => id));
  const ordered = policies.toSorted((a, b) => a.position - b.position);
  if (
    ordered.some(
      ({ id, position }, index) =>
        position !== index + 1 || !remaining.delete(id),
    )
  )
    return null;

  return ordered.map(({ id }) => id);
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

export function readL7RuleSettings(rule: OctaviaL7Rule) {
  if (rule.invert !== false || rule.admin_state_up !== true || rule.key != null)
    return null;
  const parsed = l7RuleSettingsSchema.safeParse({
    type: rule.type,
    compare_type: rule.compare_type,
    value: rule.value,
  });
  return parsed.success ? parsed.data : null;
}

export function sameL7RuleSettings(a: L7RuleSettings, b: L7RuleSettings) {
  return (
    a.type === b.type &&
    a.compare_type === b.compare_type &&
    a.value === b.value
  );
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
