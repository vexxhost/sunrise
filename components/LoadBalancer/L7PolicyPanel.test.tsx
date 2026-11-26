import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/octavia-l7-actions", () => ({
  mutateOctaviaL7Action: vi.fn(),
}));
vi.mock("@/hooks/queries/useQuotas", () => ({
  useProjectQuotaImpact: () => ({ issues: [] }),
}));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    DropdownMenu: Container,
    DropdownMenuContent: Container,
    DropdownMenuTrigger: Container,
    DropdownMenuItem: ({
      children,
      disabled,
    }: PropsWithChildren<{ disabled?: boolean }>) => (
      <button disabled={disabled}>{children}</button>
    ),
  };
});
vi.mock("@/components/mutations/MutationConfirmationDialog", () => ({
  MutationConfirmationDialog: ({
    description,
  }: {
    description: React.ReactNode;
  }) => <p>{description}</p>,
}));

import { L7PolicyDialog } from "./L7PolicyDialog";
import { L7PolicyPanel } from "./L7PolicyPanel";
import type { OctaviaL7Policy, OctaviaL7Rule } from "@/types/openstack";

const policyId = "564c3265-5933-44c7-a8da-3101e2e66a29";
const listenerId = "620630da-7cc9-45a3-97bc-f519aaa46066";
const poolId = "283d1064-329f-4709-a0ae-764fc80cb23e";
const ruleId = "9bc17a79-6c39-447b-9e95-c06bfb3a7e0c";
const scope = { projectId: "project-a", regionId: "RegionOne" };
const active = {
  project_id: scope.projectId,
  provisioning_status: "ACTIVE",
  operating_status: "OFFLINE",
  admin_state_up: true,
};
const rule: OctaviaL7Rule = {
  ...active,
  id: ruleId,
  type: "PATH",
  compare_type: "EQUAL_TO",
  value: "/ready",
  invert: false,
  l7policy_id: policyId,
};
const policy: OctaviaL7Policy = {
  ...active,
  id: policyId,
  name: "QA routing policy",
  listener_id: listenerId,
  redirect_pool_id: poolId,
  action: "REDIRECT_TO_POOL",
  position: 1,
  rules: [{ id: ruleId }],
};

function renderPanel(
  nextPolicy: OctaviaL7Policy,
  nextRule: OctaviaL7Rule | null = rule,
) {
  return renderToStaticMarkup(
    <L7PolicyPanel
      data={{
        loadBalancer: { ...active, id: "lb", name: "test" },
        listeners: [
          {
            ...active,
            id: listenerId,
            name: "web",
            protocol: "HTTP",
            protocol_port: 80,
          },
        ],
        pools: [
          {
            id: poolId,
            name: "backend",
            protocol: "HTTP",
            provisioning_status: "ACTIVE",
          },
        ],
        l7Policies: [nextPolicy],
        l7Rules: nextRule ? [nextRule] : [],
      }}
      supportsChanges
      busy={false}
      scope={scope}
      onChanged={() => {}}
    />,
  );
}

describe("Octavia L7 error recovery controls", () => {
  it("offers only failed policy deletion for a settled failed policy with a rule", () => {
    const markup = renderPanel({ ...policy, provisioning_status: "ERROR" });
    expect(markup).toMatch(
      /<button>(?:(?!<\/button>)[\s\S])*Delete failed policy<\/button>/,
    );
    expect(markup).not.toContain("Delete path rule");
    expect(markup).not.toContain("Disable policy");
    expect(renderPanel(policy)).not.toContain("Delete failed policy");
  });

  it("blocks failed policy deletion while its rule is pending", () => {
    const markup = renderPanel(
      { ...policy, provisioning_status: "ERROR" },
      { ...rule, provisioning_status: "PENDING_UPDATE" },
    );
    expect(markup).toMatch(
      /<button disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Delete failed policy<\/button>/,
    );
  });

  it("names the rule being removed in the failed policy confirmation", () => {
    const markup = renderToStaticMarkup(
      <L7PolicyDialog
        target={{
          action: "confirm",
          listenerId,
          label: policy.name,
          input: {
            action: "delete-failed-policy",
            policyId,
            poolId,
            sourceRule: {
              id: ruleId,
              settings: { compare_type: "EQUAL_TO", value: "/ready" },
            },
          },
        }}
        scope={scope}
        loadBalancerId="lb"
        listeners={[]}
        pools={[]}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(markup).toContain("and its path rule");
    expect(markup).toContain("/ready");
    expect(markup).toContain("Its listener and pool will remain.");
  });

  it("offers Disable for an enabled policy with no rules but never offers Enable", () => {
    const markup = renderPanel({ ...policy, rules: [] }, null);
    expect(markup).toMatch(
      /<button>(?:(?!<\/button>)[\s\S])*Disable policy<\/button>/,
    );
    expect(markup).not.toContain("Enable policy");
    const disabled = renderPanel(
      { ...policy, admin_state_up: false, rules: [] },
      null,
    );
    expect(disabled).not.toContain("Enable policy");
    expect(disabled).toContain("Add path rule");
    expect(disabled).toContain("Delete policy");
  });

  it("does not infer that a rule is absent if a reference remains but its details are unavailable", () => {
    const markup = renderPanel(policy, null);
    expect(markup).toContain("Unavailable");
    expect(markup).not.toContain("Disable policy");
  });
});
