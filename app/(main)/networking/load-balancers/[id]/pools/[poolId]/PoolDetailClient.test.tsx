import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useSuspenseQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: mocks.useSuspenseQuery,
  useQueryClient: () => ({}),
}));
vi.mock("@/hooks/queries/useLoadBalancers", () => ({
  loadBalancerPoolDetailsQueryOptions: () => ({}),
}));
vi.mock("@/components/LoadBalancer/MemberMutationDialog", () => ({
  MemberMutationDialog: () => null,
}));

import { PoolDetailClient } from "./PoolDetailClient";

const loadBalancerId = "11111111-1111-4111-8111-111111111111";
const poolId = "22222222-2222-4222-8222-222222222222";
const listenerId = "33333333-3333-4333-8333-333333333333";
const parentPath = `/networking/load-balancers/${loadBalancerId}`;
const loadBalancer = {
  id: loadBalancerId,
  name: "application",
  provider: "amphorav2",
  pools: [{ id: poolId }],
  provisioning_status: "ACTIVE",
};

function renderDetail(
  overrides: Record<string, unknown> = {},
  queryState: { isFetching?: boolean; isRefetchError?: boolean } = {},
) {
  mocks.useSuspenseQuery.mockReturnValue({
    ...queryState,
    data: {
      loadBalancer,
      pool: {
        id: poolId,
        name: "backend",
        protocol: "HTTP",
        lb_algorithm: "ROUND_ROBIN",
        provisioning_status: "ACTIVE",
        admin_state_up: true,
        listeners: [],
        session_persistence: { type: "APP_COOKIE", cookie_name: "app_session" },
      },
      members: [],
      listeners: [],
      healthMonitor: null,
      ...overrides,
    },
  });
  return renderToStaticMarkup(
    <PoolDetailClient
      loadBalancerId={loadBalancerId}
      neutronAvailable
      poolId={poolId}
      regionId="RegionOne"
      projectId="project-a"
    />,
  );
}

function addMemberButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Add member<\/button>/,
  )?.[0];
}

describe("pool details view", () => {
  it("shows configured persistence, an IPv6 member, the monitor, and verified links", () => {
    const markup = renderDetail({
      members: [
        {
          id: "member",
          address: "2001:db8::1",
          protocol_port: 8080,
          weight: 0,
          provisioning_status: "ACTIVE",
        },
      ],
      listeners: [{ id: listenerId, name: "web" }],
      healthMonitor: {
        id: "monitor",
        type: "HTTP",
        delay: 5,
        timeout: 3,
        url_path: "/health",
        expected_codes: "200",
      },
    });
    expect(markup).toContain("app_session");
    expect(markup).toContain("[2001:db8::1]:8080");
    expect(markup).toContain("/health");
    expect(markup).toContain(`href="${parentPath}/listeners/${listenerId}"`);
    expect(markup).toContain(`href="${parentPath}#pools"`);
    expect(markup).toContain('aria-label="Edit member member"');
    expect(markup).toContain('aria-label="Remove member member"');
    expect(addMemberButton(markup)).toBeDefined();
    expect(addMemberButton(markup)).not.toContain(' disabled=""');
  });

  it("distinguishes empty resources from unavailable child data", () => {
    const empty = renderDetail();
    expect(empty).toContain("No health monitor configured.");
    expect(empty).toContain("No members configured.");
    const unavailable = renderDetail({
      pool: {
        id: poolId,
        lb_algorithm: "ROUND_ROBIN",
        healthmonitor_id: "monitor",
      },
      members: null,
      listeners: [null],
    });
    expect(unavailable).toContain("Health monitor details are unavailable.");
    expect(unavailable).toContain("Member details are unavailable.");
    expect(unavailable).toContain("Some listener details are unavailable.");
  });

  it("does not offer member controls for an unsupported provider", () => {
    const markup = renderDetail({
      loadBalancer: { ...loadBalancer, provider: "ovn" },
    });
    expect(addMemberButton(markup)).toBeUndefined();
  });

  it.each([{ pools: [] }, { provisioning_status: "PENDING_UPDATE" }])(
    "disables edits when the parent no longer verifies the active pool: %j",
    (parentChanges) => {
      const markup = renderDetail({
        loadBalancer: { ...loadBalancer, ...parentChanges },
      });
      expect(addMemberButton(markup)).toContain(' disabled=""');
    },
  );

  it("disables new members while details are refreshing, stale, or unavailable", () => {
    expect(addMemberButton(renderDetail({}, { isFetching: true }))).toContain(
      ' disabled=""',
    );
    expect(
      addMemberButton(renderDetail({}, { isRefetchError: true })),
    ).toContain(' disabled=""');
    expect(addMemberButton(renderDetail({ members: null }))).toContain(
      ' disabled=""',
    );
  });
});
