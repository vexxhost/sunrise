import { describe, expect, it } from "vitest";

import {
  changedQosPolicyIdFromSelection,
  optionalQosPolicyIdFromSelection,
  QOS_POLICY_CLOUD_DEFAULT,
  QOS_POLICY_NONE,
} from "@/components/Network/QosPolicySelect";

describe("QoS policy selection payloads", () => {
  it("omits inherited and cloud-default selections on create", () => {
    expect(optionalQosPolicyIdFromSelection(QOS_POLICY_NONE)).toBeUndefined();
    expect(
      optionalQosPolicyIdFromSelection(QOS_POLICY_CLOUD_DEFAULT),
    ).toBeUndefined();
    expect(optionalQosPolicyIdFromSelection("policy-a")).toBe("policy-a");
  });

  it("omits unchanged empty policies regardless of API nullability", () => {
    expect(
      changedQosPolicyIdFromSelection(QOS_POLICY_NONE, undefined),
    ).toBeUndefined();
    expect(
      changedQosPolicyIdFromSelection(QOS_POLICY_NONE, null),
    ).toBeUndefined();
  });

  it("omits unchanged policies and preserves explicit attach and clear", () => {
    expect(
      changedQosPolicyIdFromSelection("policy-a", "policy-a"),
    ).toBeUndefined();
    expect(changedQosPolicyIdFromSelection("policy-a", null)).toBe("policy-a");
    expect(changedQosPolicyIdFromSelection(QOS_POLICY_NONE, "policy-a")).toBe(
      null,
    );
  });
});
