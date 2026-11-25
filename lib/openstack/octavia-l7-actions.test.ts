import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guardMutationContext: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getLoadBalancer: vi.fn(),
  getLoadBalancerListener: vi.fn(),
  getLoadBalancerPool: vi.fn(),
  getOctaviaL7Rule: vi.fn(),
  getOctaviaListenerL7Policy: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  OCTAVIA_BASELINE_MICROVERSION: "2.0",
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/octavia-server", () => ({
  getLoadBalancer: mocks.getLoadBalancer,
  getLoadBalancerListener: mocks.getLoadBalancerListener,
  getLoadBalancerPool: mocks.getLoadBalancerPool,
  getOctaviaL7Rule: mocks.getOctaviaL7Rule,
  getOctaviaListenerL7Policy: mocks.getOctaviaListenerL7Policy,
}));

import {
  mutateOctaviaL7Action,
  type OctaviaL7Mutation,
} from "./octavia-l7-actions";
import { OpenStackRequestError } from "./request";

const loadBalancerId = "4ed3f70c-5126-470d-be60-3710d8682220";
const listenerId = "620630da-7cc9-45a3-97bc-f519aaa46066";
const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
const policyId = "564c3265-5933-44c7-a8da-3101e2e66a29";
const ruleId = "9bc17a79-6c39-447b-9e95-c06bfb3a7e0c";
const otherId = "a34d1dd5-1b92-4551-ab9a-30354c96f614";
const scope = { projectId: "project-a", regionId: "RegionOne" };
const policySettings = {
  name: "api",
  description: "",
  redirect_pool_id: poolId,
};
const pathSettings = { value: "/api/", compare_type: "STARTS_WITH" } as const;
const policy = {
  ...policySettings,
  id: policyId,
  action: "REDIRECT_TO_POOL",
  listener_id: listenerId,
  project_id: scope.projectId,
  provisioning_status: "ACTIVE",
  admin_state_up: false,
  rules: [{ id: ruleId }],
};
const rule = {
  ...pathSettings,
  id: ruleId,
  type: "PATH",
  project_id: scope.projectId,
  provisioning_status: "ACTIVE",
  admin_state_up: true,
  invert: false,
  key: null,
};
const policyPath = `/v2/lbaas/l7policies/${policyId}`;
const sourceRule = { id: ruleId, settings: pathSettings };
const mutate = (input: OctaviaL7Mutation) =>
  mutateOctaviaL7Action(scope, loadBalancerId, listenerId, input);

describe("Octavia L7 path routing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.getLoadBalancer.mockResolvedValue({
      id: loadBalancerId,
      listeners: [{ id: listenerId }],
      provider: "amphorav2",
      provisioning_status: "ACTIVE",
    });
    mocks.getLoadBalancerListener.mockResolvedValue({
      protocol: "HTTP",
      provisioning_status: "ACTIVE",
      l7policies: [{ id: policyId }],
    });
    mocks.getLoadBalancerPool.mockResolvedValue({
      protocol: "HTTP",
      provisioning_status: "ACTIVE",
    });
    mocks.getOctaviaListenerL7Policy.mockResolvedValue(policy);
    mocks.getOctaviaL7Rule.mockResolvedValue(rule);
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it("creates a disabled policy at the cloud's default position on a verified listener and pool", async () => {
    await mutate({ action: "create-policy", settings: policySettings });
    expect(mocks.getLoadBalancerListener).toHaveBeenCalledWith(
      loadBalancerId,
      listenerId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.getLoadBalancerPool).toHaveBeenCalledWith(
      loadBalancerId,
      poolId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "POST",
        path: "/v2/lbaas/l7policies",
        body: {
          l7policy: {
            ...policySettings,
            listener_id: listenerId,
            action: "REDIRECT_TO_POOL",
            admin_state_up: false,
          },
        },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ l7policy: policy })).toBeNull();
    expect(() =>
      transform({ l7policy: { ...policy, listener_id: otherId } }),
    ).toThrow();
  });

  it("blocks a foreign, incompatible, or pending target pool", async () => {
    mocks.getLoadBalancerPool
      .mockRejectedValueOnce(new OpenStackRequestError(404, "Not found"))
      .mockResolvedValueOnce({ protocol: "TCP", provisioning_status: "ACTIVE" })
      .mockResolvedValueOnce({
        protocol: "HTTP",
        provisioning_status: "PENDING_UPDATE",
      });
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        mutate({ action: "create-policy", settings: policySettings }),
      ).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not look up a policy outside the listener's references", async () => {
    await expect(
      mutate({ action: "delete-policy", policyId: otherId }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.getOctaviaListenerL7Policy).not.toHaveBeenCalled();
  });

  it.each([
    "//host/path",
    "https://host/path",
    "/api?x=1",
    "/api#hash",
    "/some path",
    "/bad%zz",
    "/\nnext",
  ])("rejects a non-path or malformed path: %j", async (value) => {
    await expect(
      mutate({
        action: "add-rule",
        policyId,
        settings: { ...pathSettings, value },
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.getLoadBalancer).not.toHaveBeenCalled();
  });

  it("adds only one non-inverted, enabled PATH rule to a disabled policy", async () => {
    await expect(
      mutate({ action: "add-rule", policyId, settings: pathSettings }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    mocks.getOctaviaListenerL7Policy.mockResolvedValueOnce({
      ...policy,
      rules: [],
    });
    await mutate({ action: "add-rule", policyId, settings: pathSettings });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "POST",
        path: policyPath + "/rules",
        body: {
          rule: {
            ...pathSettings,
            type: "PATH",
            invert: false,
            admin_state_up: true,
          },
        },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ rule })).toBeNull();
    expect(() =>
      transform({ rule: { ...rule, l7policy_id: otherId } }),
    ).toThrow();
    expect(() =>
      transform({ rule: { ...rule, project_id: "other" } }),
    ).toThrow();
  });

  it("does not activate a ruleless, stale, inverted, disabled or pending rule", async () => {
    const enable = {
      action: "set-enabled",
      policyId,
      enabled: true,
      poolId,
      sourceRule,
    } as const;
    mocks.getOctaviaListenerL7Policy.mockResolvedValueOnce({
      ...policy,
      rules: [],
    });
    await expect(mutate(enable)).resolves.toMatchObject({ ok: false });
    for (const changed of [
      { value: "/other/" },
      { invert: true },
      { admin_state_up: false },
      { provisioning_status: "PENDING_CREATE" },
      { provisioning_status: "ERROR" },
    ]) {
      mocks.getOctaviaL7Rule.mockResolvedValueOnce({ ...rule, ...changed });
      await expect(mutate(enable)).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    await mutate(enable);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "PUT",
        path: policyPath,
        body: { l7policy: { admin_state_up: true } },
      }),
    );
  });

  it("updates only the requested path and refuses a write while the policy is enabled", async () => {
    const edit = {
      action: "edit-rule",
      policyId,
      settings: { value: "/ready", compare_type: "EQUAL_TO" },
      sourceRule,
    } as const;
    mocks.getOctaviaListenerL7Policy.mockResolvedValueOnce({
      ...policy,
      admin_state_up: true,
    });
    await expect(mutate(edit)).resolves.toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    await mutate(edit);
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "PUT",
        path: policyPath + "/rules/" + ruleId,
        body: { rule: edit.settings },
      }),
    );
  });

  it("requires an empty disabled policy before deleting; otherwise only removes its rule", async () => {
    await expect(
      mutate({ action: "delete-policy", policyId }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    await mutate({ action: "delete-rule", policyId, sourceRule });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: policyPath + "/rules/" + ruleId,
      }),
    );
    mocks.getOctaviaListenerL7Policy.mockResolvedValueOnce({
      ...policy,
      rules: [],
    });
    await mutate({ action: "delete-policy", policyId });
    expect(mocks.executeOpenStackMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: policyPath,
      }),
    );
  });

  it.each([
    { enabled: false, ruleStatus: "ACTIVE" },
    { enabled: true, ruleStatus: "ERROR" },
  ])(
    "removes an errored policy and its verified rule: %j",
    async ({ enabled, ruleStatus }) => {
      mocks.getOctaviaListenerL7Policy.mockResolvedValue({
        ...policy,
        admin_state_up: enabled,
        provisioning_status: "ERROR",
      });
      mocks.getOctaviaL7Rule.mockResolvedValue({
        ...rule,
        provisioning_status: ruleStatus,
      });
      await expect(
        mutate({ action: "delete-rule", policyId, sourceRule }),
      ).resolves.toMatchObject({ ok: false });
      await expect(
        mutate({ action: "delete-policy", policyId }),
      ).resolves.toMatchObject({ ok: false });
      await expect(
        mutate({
          action: "delete-failed-policy",
          policyId,
          poolId,
          sourceRule,
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(mocks.getOctaviaL7Rule).toHaveBeenCalledWith(
        policyId,
        ruleId,
        scope.regionId,
        scope.projectId,
      );
      expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          method: "DELETE",
          path: policyPath,
        }),
      );
    },
  );

  it("also allows recovery of an errored policy with no rules", async () => {
    mocks.getOctaviaListenerL7Policy.mockResolvedValue({
      ...policy,
      rules: [],
      provisioning_status: "ERROR",
    });
    await expect(
      mutate({
        action: "delete-failed-policy",
        policyId,
        poolId,
        sourceRule: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.getOctaviaL7Rule).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "DELETE",
        path: policyPath,
      }),
    );
  });

  it("rejects recovery when the policy or confirmed rule changed or is pending", async () => {
    const failed = { ...policy, provisioning_status: "ERROR" };
    const recovery = {
      action: "delete-failed-policy",
      policyId,
      poolId,
      sourceRule,
    } as const;
    for (const overrides of [
      { provisioning_status: "ACTIVE" },
      { provisioning_status: "PENDING_UPDATE" },
      { redirect_pool_id: otherId },
      { rules: [] },
      { rules: [{ id: otherId }] },
      { rules: [{ id: ruleId }, { id: otherId }] },
    ]) {
      mocks.getOctaviaListenerL7Policy.mockResolvedValueOnce({
        ...failed,
        ...overrides,
      });
      await expect(mutate(recovery)).resolves.toMatchObject({ ok: false });
    }
    mocks.getOctaviaListenerL7Policy.mockResolvedValue(failed);
    for (const overrides of [
      { provisioning_status: "PENDING_DELETE" },
      { value: "/another-path/" },
    ]) {
      mocks.getOctaviaL7Rule.mockResolvedValueOnce({ ...rule, ...overrides });
      await expect(mutate(recovery)).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("allows disabling an active policy with an errored rule so the rule can be removed", async () => {
    mocks.getOctaviaListenerL7Policy.mockResolvedValue({
      ...policy,
      admin_state_up: true,
    });
    mocks.getOctaviaL7Rule.mockResolvedValue({
      ...rule,
      provisioning_status: "ERROR",
    });
    await expect(
      mutate({
        action: "set-enabled",
        policyId,
        enabled: false,
        poolId,
        sourceRule,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "PUT",
        path: policyPath,
        body: { l7policy: { admin_state_up: false } },
      }),
    );
  });
});
